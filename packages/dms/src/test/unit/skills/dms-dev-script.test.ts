import { execFile } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect } from "chai";

const PACKAGE_ROOT = resolve(__dirname, "..", "..", "..", "..");
const SCRIPT = join(PACKAGE_ROOT, "skills", "dms-dev", "scripts", "dms-dev.sh");
const SCRIPT_TIMEOUT_MS = 30_000;
const SUITE_TIMEOUT_MS = 90_000;
const STOP_GRACE_SECONDS = "1";
const READY_TIMEOUT_SECONDS = "15";
const PROJECT_PORTS = { first: 6110, second: 6120 };

// Named after the real processes so the pattern-based fallback picks them up too.
const FAKE_BACKEND = `#!/usr/bin/env bash
mkdir -p .antelope
printf '{"pid": %s, "servers": {"api": {"endpoints": [{"protocol": "http", "host": "0.0.0.0", "port": %s}]}}}' "$$" "$FAKE_PORT" > .antelope/dev.json
sleep 300 &
echo "Server started, listening on http://localhost:$FAKE_PORT"
wait
`;
// Ignores SIGTERM, like a renderer stuck in shutdown, so the SIGKILL fallback is exercised.
const FAKE_FRONTEND = `#!/usr/bin/env bash
trap '' TERM
sleep 300 &
echo "Server ready on http://localhost:$((FAKE_PORT + 1))"
wait
`;

const runProcess = promisify(execFile);

interface FakeProject {
  dir: string;
  port: number;
}

interface ExecFailure {
  code?: number;
  stdout?: string;
  stderr?: string;
}

interface ScriptResult {
  code: number;
  output: string;
}

function createProject(root: string, name: string, port: number): FakeProject {
  const dir = join(root, name);
  mkdirSync(join(dir, "bin"), { recursive: true });
  writeFileSync(join(dir, "package.json"), "{}");
  writeFileSync(join(dir, "bin", "antelope-runner"), FAKE_BACKEND);
  writeFileSync(join(dir, "bin", "ajs-dms"), FAKE_FRONTEND);
  chmodSync(join(dir, "bin", "antelope-runner"), 0o755);
  chmodSync(join(dir, "bin", "ajs-dms"), 0o755);
  return { dir, port };
}

async function runScript(
  project: FakeProject,
  command: string,
): Promise<ScriptResult> {
  const env = {
    ...process.env,
    FAKE_PORT: String(project.port),
    DMS_BACK_DIR: project.dir,
    DMS_BACK_CMD: join(project.dir, "bin", "antelope-runner"),
    DMS_FRONT_CMD: `${join(project.dir, "bin", "ajs-dms")} dev`,
    DMS_BACK_LOG: join(project.dir, "back.log"),
    DMS_FRONT_LOG: join(project.dir, "front.log"),
    DMS_DEV_STOP_GRACE: STOP_GRACE_SECONDS,
    DMS_DEV_TIMEOUT: READY_TIMEOUT_SECONDS,
  };
  try {
    const { stdout, stderr } = await runProcess("bash", [SCRIPT, command], {
      env,
      timeout: SCRIPT_TIMEOUT_MS,
    });
    return { code: 0, output: stdout + stderr };
  } catch (error) {
    const failure = error as ExecFailure;
    return {
      code: failure.code ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

function pidFile(project: FakeProject): string {
  return join(project.dir, ".antelope", "dms-dev.pid");
}

function recordedPids(project: FakeProject): number[] {
  return readFileSync(pidFile(project), "utf8")
    .trim()
    .split("\n")
    .map((line) => Number(line.split(" ")[1]));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("[unit] skills/dms-dev script", function () {
  this.timeout(SUITE_TIMEOUT_MS);
  let root: string;
  let first: FakeProject;
  let second: FakeProject;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "dms-dev-script-"));
    first = createProject(root, "first", PROJECT_PORTS.first);
    second = createProject(root, "second", PROJECT_PORTS.second);
  });

  afterEach(async () => {
    await runScript(first, "stop");
    await runScript(second, "stop");
    rmSync(root, { recursive: true, force: true });
  });

  it("reports the ports the servers announce", async () => {
    const started = await runScript(first, "start");

    expect(started.code, started.output).to.equal(0);
    expect(started.output).to.contain(
      `backend ready on http://localhost:${PROJECT_PORTS.first}.`,
    );
    expect(started.output).to.contain(
      `frontend ready on http://localhost:${PROJECT_PORTS.first + 1}.`,
    );
  });

  it("stops only the processes of its own project", async () => {
    await runScript(first, "start");
    await runScript(second, "start");
    const firstPids = recordedPids(first);
    const secondPids = recordedPids(second);

    const stopped = await runScript(first, "stop");

    expect(stopped.code, stopped.output).to.equal(0);
    expect(firstPids.filter(isAlive)).to.deep.equal([]);
    expect(secondPids.filter(isAlive)).to.deep.equal(secondPids);
    expect(existsSync(pidFile(first))).to.equal(false);
  });

  it("falls back to the project's directory when the pid file is gone", async () => {
    await runScript(first, "start");
    await runScript(second, "start");
    const firstPids = recordedPids(first);
    const secondPids = recordedPids(second);
    rmSync(pidFile(first));

    const stopped = await runScript(first, "stop");

    expect(stopped.code, stopped.output).to.equal(0);
    expect(firstPids.filter(isAlive)).to.deep.equal([]);
    expect(secondPids.filter(isAlive)).to.deep.equal(secondPids);
  });

  it("fails fast when the server command dies right away", async () => {
    rmSync(join(first.dir, "bin", "antelope-runner"));
    const startedAt = Date.now();

    const started = await runScript(first, "start");

    expect(started.code).to.equal(1);
    expect(started.output).to.contain("exited before becoming ready");
    expect(Date.now() - startedAt).to.be.below(SCRIPT_TIMEOUT_MS / 2);
  });
});
