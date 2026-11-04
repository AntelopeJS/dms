import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

const MODULE_ROOT = resolve(__dirname, "../../..");
const PROVIDERS = join(MODULE_ROOT, ".antelope/cache/@antelopejs");
const INSTALLED_API = join(MODULE_ROOT, "node_modules/@antelopejs/api");
const SECRET = "replica-test-secret";
const READY_POLL_MS = 250;

/** The lease timing a replica runs on, short enough for a test to outlast. */
export const LEASE = {
  renewEveryMs: 500,
  staleAfterMs: 3000,
  pollEveryMs: 250,
};

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address instanceof Object ? address.port : undefined;
      server.close(() =>
        port ? done(port) : fail(new Error("No free port was assigned")),
      );
    });
  });
}

function projectConfig(database: string, port: number, directory: string) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const provider = (name: string) => ({
    source: { type: "local", path: join(PROVIDERS, name) },
  });
  return {
    name: "dms-replica-test",
    cacheFolder: join(directory, "cache"),
    logging: { channelFilter: { "*": "warn" } },
    modules: {
      dms: {
        source: { type: "local", path: MODULE_ROOT },
        config: {
          clientBaseUrl: "http://localhost:3001",
          auth: { jwtSecret: SECRET },
          htmlRender: { serviceSecret: SECRET },
          frontend: { bootstrapSecret: SECRET },
          provisioningLease: LEASE,
        },
      },
      "replica-host": {
        source: {
          type: "local",
          path: join(MODULE_ROOT, "test-hosts/replica-host"),
        },
      },
      mongodb: {
        ...provider("mongodb"),
        config: { url: process.env.TEST_MONGO_URL, database },
      },
      "auth-jwt": { ...provider("auth-jwt"), config: { secret: SECRET } },
      api: {
        source: { type: "local", path: INSTALLED_API },
        config: {
          publicBaseUrl: baseUrl,
          servers: [{ protocol: "http", host: "127.0.0.1", port }],
        },
      },
      "file-storage-local": {
        ...provider("file-storage-local"),
        config: {
          storagePath: join(directory, "storage"),
          baseUrl,
          defaultVisibility: "private",
        },
      },
      nodemailer: {
        ...provider("nodemailer"),
        config: { host: "127.0.0.1", port: 1 },
      },
    },
  };
}

/** A replica: its own process and project folder, on a shared database. */
export class ReplicaProcess {
  private output = "";
  private exit: number | string | null | undefined;

  private constructor(
    private readonly child: ChildProcess,
    private readonly directory: string,
    private readonly port: number,
  ) {
    const append = (chunk: Buffer) => {
      this.output += chunk.toString();
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("exit", (code, signal) => {
      this.exit = code ?? signal;
    });
  }

  static async start(
    database: string,
    holdMs: number,
  ): Promise<ReplicaProcess> {
    const directory = await mkdtemp(join(tmpdir(), "dms-replica-"));
    const port = await freePort();
    await writeFile(
      join(directory, "antelope.config.ts"),
      `export default ${JSON.stringify(projectConfig(database, port, directory))};\n`,
    );
    const child = spawn(
      join(MODULE_ROOT, "node_modules/.bin/ajs"),
      ["project", "run", "--project", directory],
      {
        cwd: directory,
        env: { ...process.env, REPLICA_HOST_HOLD_MS: String(holdMs) },
      },
    );
    return new ReplicaProcess(child, directory, port);
  }

  get running(): boolean {
    return this.exit === undefined;
  }

  /** What the process printed so far, for the assertion messages. */
  get log(): string {
    return this.output;
  }

  count(line: string): number {
    return this.output.split("\n").filter((text) => text.includes(line)).length;
  }

  /** Resolves once the HTTP gate opened; throws if the process exits first. */
  async started(): Promise<void> {
    while (this.running) {
      const status = await fetch(
        `http://127.0.0.1:${this.port}/api/system-state`,
      ).then(
        (response) => response.status,
        () => undefined,
      );
      if (status !== undefined && status !== 503) return;
      await setTimeout(READY_POLL_MS);
    }
    throw new Error(`Replica exited with ${this.exit}:\n${this.output}`);
  }

  /** Resolves once `line` was printed `times` times. */
  async printed(line: string, times = 1): Promise<void> {
    while (this.running && this.count(line) < times) {
      await setTimeout(READY_POLL_MS);
    }
    if (this.count(line) < times) {
      throw new Error(`Replica exited with ${this.exit}:\n${this.output}`);
    }
  }

  /** Ends the process without any shutdown running. */
  async kill(): Promise<void> {
    if (this.running) this.child.kill("SIGKILL");
    while (this.running) await setTimeout(READY_POLL_MS);
  }

  async remove(): Promise<void> {
    await this.kill();
    await rm(this.directory, { recursive: true, force: true });
  }
}
