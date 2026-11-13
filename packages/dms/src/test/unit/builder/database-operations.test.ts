import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { expect } from "chai";
import { z } from "zod";
import {
  ConfigureProject,
  GetDatabaseConnection,
  GetDatabaseProject,
  ListDatabaseConnections,
  SampleDatabaseRows,
} from "../../../implementations/dms-builder";
import {
  checkConnection,
  parseCheckInput,
  setCatalogConnectionsForTests,
} from "../../../implementations/dms-builder/engine";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
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
      const bad = [
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
      }
      await settled();
      expect(server.connections()).to.equal(0);
    } finally {
      await server.close();
    }
  });
});

/** Fails on a listing that one failing provider empties, or a sample that throws past its result. */
describe("the builder's catalog connections", () => {
  const info = {
    engine: "postgresql",
    version: "17.5",
    database: "erp",
    role: "reader",
  };
  const rows = {
    relation: "sales.orders",
    columns: ["id"],
    rows: [[{ text: "1", truncated: false }]],
    sample: null,
  };

  before(() => {
    setCatalogConnectionsForTests({
      erp: {
        Info: async () => info,
        SampleRows: async ({ relation }) => {
          if (relation !== rows.relation) {
            throw new Error(`relation ${relation} does not exist`);
          }
          return rows;
        },
      },
      archive: {},
    });
  });

  after(() => setCatalogConnectionsForTests());

  it("lists each connection with its provider's Info, or why it did not answer", async () => {
    expect(await ListDatabaseConnections()).to.deep.equal([
      { id: "erp", ...info },
      { id: "archive", error: "the spec supplied no Info for this catalog" },
    ]);
  });

  it("samples a relation, and answers a provider's refusal and an unknown connection as results", async () => {
    expect(
      await SampleDatabaseRows("erp", { relation: rows.relation, limit: 1 }),
    ).to.deep.equal({ ok: true, data: rows, changes: [] });
    const refused = await SampleDatabaseRows("erp", {
      relation: "sales.missing",
      limit: 1,
    });
    expect(JSON.stringify(refused)).to.include(
      "relation sales.missing does not exist",
    );
    expect(
      await SampleDatabaseRows("ledger", { relation: rows.relation, limit: 1 }),
    ).to.deep.equal({ ok: false, error: { code: "not_found", ref: "ledger" } });
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
