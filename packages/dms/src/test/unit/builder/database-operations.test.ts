import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { expect } from "chai";
import type { JsonValue } from "@antelopejs/interface-dms/json";
import { z } from "zod";
import {
  ConfigureProject,
  GetDatabaseConnection,
  GetDatabaseProject,
  ListDatabaseConnections,
} from "../../../implementations/dms-builder";
import {
  checkConnection,
  parseCheckInput,
  setCatalogConnectionsForTests,
  setProbeLoaderForTests,
} from "../../../implementations/dms-builder/engine";
import {
  DATABASE_ENGINE_SCHEMES,
  type DatabaseEngine,
  type ProjectConfigStep,
} from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { gitInit } from "./helpers/processes";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 60_000;
const SETTLE_MS = 50;
const SECRET = `${randomBytes(4).toString("hex")}-secret`;
const VARIABLE = "ERP_DATABASE_URL";
const URL = "postgres://reader:secret@db.example:5432/erp";

/** A local server that counts the connections made to it. */
async function listen(): Promise<{
  port: number;
  connections: () => number;
  close: () => Promise<void>;
}> {
  let count = 0;
  const server = net.createServer((socket) => {
    count += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: z.object({ port: z.number() }).parse(server.address()).port,
    connections: () => count,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

/** Fails on a check that runs outside development, or on an input it did not parse. */
describe("checking a database connection", () => {
  it("refuses outside development and opens no connection", async () => {
    const server = await listen();
    try {
      const url = `postgres://u:${SECRET}@127.0.0.1:${server.port}/db`;
      const result = await checkConnection(
        parseCheckInput({ engine: "postgres", url }),
        false,
      );
      expect(result.ok ? "ok" : result.error.code).to.equal("unsupported");
      await settled();
      expect(server.connections()).to.equal(0);
    } finally {
      await server.close();
    }
  });

  it("refuses an input that is not an engine and a URL of that engine, never echoing the URL", async () => {
    const server = await listen();
    try {
      const url = `postgres://u:${SECRET}@127.0.0.1:${server.port}/db`;
      const bad: JsonValue[] = [
        {},
        { engine: "postgres" },
        { url },
        { engine: "oracle", url },
        { engine: "mongodb", url },
        { engine: "postgres", url: "not a url" },
        { engine: "postgres", url: 5 },
        null,
      ];
      for (const input of bad) {
        const result = await checkConnection(parseCheckInput(input), true);
        const label = JSON.stringify(input);
        expect(result.ok ? "ok" : result.error.code, label).to.equal(
          "invalid_config",
        );
        expect(JSON.stringify(result), label).not.to.include(SECRET);
        expect(JSON.stringify(result), label).not.to.include("undefined");
      }
      await settled();
      expect(server.connections()).to.equal(0);
    } finally {
      await server.close();
    }
  });

  it("refuses a MySQL URL whose host is a socket path, which mysql2 would look up as a host name", async () => {
    setProbeLoaderForTests(() => undefined);
    const answer = async (engine: DatabaseEngine, url: string) => {
      const result = await checkConnection(
        parseCheckInput({ engine, url }),
        true,
      );
      return result.ok ? "checked" : result.error;
    };
    try {
      for (const host of [
        "%2Fvar%2Frun%2Fmysqld",
        "%2Fvar%2Frun%2Fmysqld.sock",
      ]) {
        const result = await answer("mysql", `mysql://u:${SECRET}@${host}/erp`);
        expect(result, host).to.deep.equal({
          code: "invalid_config",
          issues: [
            {
              pointer: "",
              message:
                "the host is a name or an address only: no spaces, port or path",
            },
          ],
        });
      }
      for (const host of ["db.example", "[::1]", "127.0.0.1"]) {
        expect(
          await answer("mysql", `mysql://u@${host}:3306/erp`),
          host,
        ).to.equal("checked");
      }
      expect(
        await answer(
          "mysql",
          "mysql:///erp?socketPath=%2Fvar%2Frun%2Fmysqld%2Fmysqld.sock",
        ),
      ).to.equal("checked");
      expect(
        await answer("postgres", "postgres://u@%2Fvar%2Frun%2Fpostgresql/erp"),
      ).to.equal("checked");
    } finally {
      setProbeLoaderForTests();
    }
  });
});

/** Fails on a check that sends an input to another engine's probe, or answers a missing driver with its require error. */
describe("checking a database whose driver is not installed", () => {
  it("answers, for every scheme of every engine, the sentence that installs that engine's driver", async () => {
    setProbeLoaderForTests(() => undefined);
    const sentences: Record<DatabaseEngine, string> = {
      postgres:
        "Install @antelopejs/postgres to connect a PostgreSQL database.",
      mysql:
        "Install @antelopejs/mysql to connect a MySQL or MariaDB database.",
      mongodb: "Install @antelopejs/mongodb to connect a MongoDB database.",
      rethinkdb:
        "Install @antelopejs/rethinkdb to connect a RethinkDB database.",
    };
    try {
      for (const [engine, schemes] of Object.entries(DATABASE_ENGINE_SCHEMES)) {
        for (const scheme of schemes) {
          const input = {
            engine,
            url: `${scheme}//u@127.0.0.1:1/db`,
            extra: 1,
          };
          const reason = Object.entries(sentences).find(
            ([name]) => name === engine,
          )?.[1];
          expect(
            await checkConnection(parseCheckInput(input), true),
            scheme,
          ).to.deep.equal({
            ok: true,
            data: { reachable: false, canRead: false, canWrite: false, reason },
            changes: [],
          });
        }
      }
    } finally {
      setProbeLoaderForTests();
    }
  });
});

/** Fails on a listing that one failing provider empties. */
describe("the builder's catalog connections", () => {
  const info = {
    engine: "postgresql",
    version: "17.5",
    database: "erp",
    role: "reader",
  };

  before(() => {
    setCatalogConnectionsForTests({
      erp: {
        Info: async () => info,
      },
      archive: {},
      broken: {
        get Info(): never {
          throw new TypeError("the provider does not export the catalog");
        },
      },
    });
  });

  after(() => setCatalogConnectionsForTests());

  it("lists each connection with its provider's Info, or why it did not answer", async () => {
    expect(await ListDatabaseConnections()).to.deep.equal([
      { id: "erp", ...info },
      { id: "archive", error: "the spec supplied no Info for this catalog" },
      { id: "broken", error: "the provider does not export the catalog" },
    ]);
  });
});

/** Fails on a ConfigureProject that drops its variables, or writes `.env` on a dry run. */
describe("connecting a database to the project", function () {
  this.timeout(OP_TIMEOUT);

  let app: Fixture;
  const steps: ProjectConfigStep[] = [
    {
      op: "ConfigureModule",
      id: "erp-tables",
      entry: { config: { mode: "external" }, env: { url: VARIABLE } },
    },
  ];

  function configText(): string {
    return projectFile(app.root, "antelope.config.ts");
  }

  beforeEach(() => {
    app = createFixture({ modules: ["erp-tables"] });
    gitInit(app.root);
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
  });

  afterEach(destroyFixture);

  it("writes the variables into .env with the configuration that maps them", async () => {
    expectOk(
      await ConfigureProject(steps, {
        variables: [{ name: VARIABLE, value: URL }],
      }),
      "ConfigureProject with its variable",
    );
    expect(projectFile(app.root, ".env")).to.equal(`${VARIABLE}="${URL}"\n`);
    expect(configText()).to.include(
      `${VARIABLE}: "modules.erp-tables.config.url"`,
    );
  });

  it("writes neither .env nor the configuration on a dry run", async () => {
    const before = configText();
    expectOk(
      await ConfigureProject(steps, {
        dryRun: true,
        variables: [{ name: VARIABLE, value: URL }],
      }),
      "ConfigureProject dry run",
    );
    expect(configText()).to.equal(before);
    expect(fs.existsSync(path.join(app.root, ".env"))).to.equal(false);
  });

  it("answers the project's modules, and not_found for a connection no module declares", async () => {
    const project = await GetDatabaseProject();
    expect(project.ok && project.data.modules).to.include("erp-tables");
    expect(await GetDatabaseConnection("erp")).to.deep.equal({
      ok: false,
      error: { code: "not_found", ref: "erp" },
    });
  });
});
