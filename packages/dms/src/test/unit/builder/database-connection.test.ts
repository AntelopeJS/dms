import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import { ConfigureProject } from "../../../implementations/dms-builder";
import {
  connectionDetails,
  connectionWiring,
  setConnectionUrl,
  removeDatabaseConnection,
  configureProjectWithVariables,
  projectVariable,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { gitInit } from "./helpers/processes";
import { builderRecord, moduleFolderExists } from "./helpers/module-manifest";
import { projectFile, withFileEdited } from "./helpers/project-files";

const OP_TIMEOUT = 120_000;
const CATALOG = "@antelopejs/interface-database-catalog";
const DATABASE = "@antelopejs/interface-database";
const PASSWORD = "s3cret-pw";
const URL = `postgres://reader:${PASSWORD}@db.example:5432/erp?sslmode=require`;

let app: Fixture;

function connectSteps(
  connection: string,
  tables: ProjectConfigStep,
): ProjectConfigStep[] {
  const driver = `builder-db-${connection}`;
  const catalog = {
    importOverrides: [{ interface: CATALOG, source: driver, id: connection }],
  };
  return [
    {
      op: "AddModule",
      id: driver,
      entry: {
        source: {
          type: "package",
          package: "@antelopejs/postgres",
          version: "^0.2.1",
        },
        config: { mode: "external" },
        env: { url: `BUILDER_DB_${connection.toUpperCase()}_URL` },
        exportPriority: { [DATABASE]: -1 },
      },
    },
    tables,
    { op: "ConfigureModule", id: "dms-builder", entry: catalog },
    { op: "ConfigureModule", id: "dms-ai", entry: catalog },
  ];
}

function tablesEntry(connection: string) {
  return {
    importOverrides: [
      { interface: DATABASE, source: `builder-db-${connection}` },
    ],
  };
}

function connect(connection: string, tables: ProjectConfigStep): void {
  expectOk(
    configureProjectWithVariables(connectSteps(connection, tables), [
      {
        name: `BUILDER_DB_${connection.toUpperCase()}_URL`,
        value: URL,
      },
    ]),
    `connecting ${connection}`,
  );
}

/** A connection whose details are edited, then taken out of the project with its tables module. */
describe("a database connection after it was made", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    app = createFixture({ modules: ["dms-builder", "dms-ai"] });
    gitInit(app.root);
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    connect("erp", {
      op: "CreateLocalModule",
      id: "erp-tables",
      path: "modules/erp-tables",
      entry: tablesEntry("erp"),
      connection: "erp",
    });
  });

  after(destroyFixture);

  it("answers what the connection wired, and its details without the password", () => {
    const wiring = connectionWiring("erp");
    expect(wiring).to.deep.equal({
      connection: "erp",
      driver: "builder-db-erp",
      modules: [{ id: "erp-tables", path: "modules/erp-tables" }],
      unrecorded: [],
      ownsDriver: true,
      variable: "BUILDER_DB_ERP_URL",
      variables: ["BUILDER_DB_ERP_URL"],
    });
    const details = connectionDetails(wiring!);
    expect(expectOk(details, "connectionDetails")).to.deep.equal({
      scheme: "postgres",
      host: "db.example",
      port: "5432",
      database: "erp",
      user: "reader",
      hasPassword: true,
      options: { sslmode: "require" },
    });
    expect(JSON.stringify(details)).to.not.include(PASSWORD);
  });

  it("keeps the password when new details leave it out on the same server", () => {
    expectOk(
      setConnectionUrl(
        "erp",
        "postgres://reader@db.example:5432/erp?sslmode=verify-full",
      ),
      "setConnectionUrl",
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.equal(
      `postgres://reader:${PASSWORD}@db.example:5432/erp?sslmode=verify-full`,
    );
  });

  it("writes no configuration when it loads .env already, and the loading code when it does not", () => {
    const unchanged = setConnectionUrl("erp", URL);
    expect(expectOk(unchanged, "setConnectionUrl").variable).to.equal(
      "BUILDER_DB_ERP_URL",
    );
    expect(unchanged.ok && unchanged.changes).to.deep.equal([]);
    const config = projectFile(app.root, "antelope.config.ts");
    fs.writeFileSync(
      path.join(app.root, "antelope.config.ts"),
      config.replace(/const projectEnvFile[\s\S]*?\n}\n/, ""),
    );
    expectOk(setConnectionUrl("erp", URL), "setConnectionUrl");
    expect(projectFile(app.root, "antelope.config.ts")).to.include(
      "process.loadEnvFile(projectEnvFile);",
    );
  });

  it("does not send the kept password to another host", () => {
    const moved = setConnectionUrl(
      "erp",
      "postgres://reader@db2.example:5432/erp",
    );
    expect(moved.ok ? "" : JSON.stringify(moved.error)).to.match(
      /kept only for the same host, port and user/,
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.include(
      "@db.example:5432/",
    );
  });

  it("does not send the kept password to another port", () => {
    const moved = setConnectionUrl("erp", "postgres://reader@db.example/erp");
    expect(moved.ok ? "" : JSON.stringify(moved.error)).to.match(
      /kept only for the same host, port and user/,
    );
  });

  it("refuses a URL of another engine", () => {
    const other = setConnectionUrl(
      "erp",
      "mysql://reader:pw@db.example:5432/erp",
    );
    expect(other.ok ? "" : JSON.stringify(other.error)).to.match(
      /reads postgres URLs/,
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.match(/^postgres:/);
  });

  it("keeps a password the URL gives as a parameter, and never answers it", () => {
    expectOk(
      setConnectionUrl(
        "erp",
        `postgres://reader@db.example:5432/erp?password=${PASSWORD}`,
      ),
      "setConnectionUrl",
    );
    const read = connectionDetails(connectionWiring("erp")!);
    expect(expectOk(read, "connectionDetails")).to.deep.include({
      hasPassword: true,
      options: {},
    });
    expect(JSON.stringify(read)).to.not.include(PASSWORD);
    expectOk(
      setConnectionUrl("erp", "postgres://reader@db.example:5432/erp2"),
      "setConnectionUrl",
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.equal(
      `postgres://reader@db.example:5432/erp2?password=${PASSWORD}`,
    );
    const moved = setConnectionUrl("erp", "postgres://reader@db2.example/erp");
    expect(moved.ok).to.equal(false);
    expectOk(setConnectionUrl("erp", URL), "setConnectionUrl");
  });

  it("keeps a password for a user given as a parameter", () => {
    expectOk(
      setConnectionUrl(
        "erp",
        `postgres://db.example:5432/erp?user=reader&password=${PASSWORD}`,
      ),
      "setConnectionUrl",
    );
    expectOk(
      setConnectionUrl(
        "erp",
        "postgres://db.example:5432/erp?user=reader&sslmode=require",
      ),
      "setConnectionUrl",
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.include(
      `password=${PASSWORD}`,
    );
    expectOk(setConnectionUrl("erp", URL), "setConnectionUrl");
  });

  it("lets the user be cleared, and then keeps no password", () => {
    expectOk(
      setConnectionUrl("erp", "postgres://db.example:5432/erp"),
      "setConnectionUrl",
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.equal(
      "postgres://db.example:5432/erp",
    );
    expectOk(setConnectionUrl("erp", URL), "setConnectionUrl");
  });

  it("answers the database name the driver reads, decoded as it decodes it", () => {
    expectOk(
      setConnectionUrl(
        "erp",
        `postgres://reader:${PASSWORD}@db.example:5432/app%2Fprod`,
      ),
      "setConnectionUrl",
    );
    const read = connectionDetails(connectionWiring("erp")!);
    expect(expectOk(read, "connectionDetails").database).to.equal("app%2Fprod");
    expectOk(setConnectionUrl("erp", URL), "setConnectionUrl");
  });

  it("keeps the password for the same user however the URL spells it", () => {
    expectOk(
      setConnectionUrl(
        "erp",
        `postgres://app+ro:${PASSWORD}@db.example:5432/erp`,
      ),
      "setConnectionUrl",
    );
    expectOk(
      setConnectionUrl("erp", "postgres://app%2Bro@db.example:5432/erp"),
      "setConnectionUrl",
    );
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.include(PASSWORD);
    expectOk(setConnectionUrl("erp", URL), "setConnectionUrl");
  });

  it("keeps a driver another module of the project reads through, with its URL", async () => {
    expectOk(
      await ConfigureProject([
        {
          op: "AddModule",
          id: "reports",
          entry: {
            source: { type: "local", path: "." },
            importOverrides: [
              { interface: DATABASE, source: "builder-db-erp" },
            ],
          },
        },
      ]),
      "AddModule reports",
    );
    expect(connectionWiring("erp")).to.deep.include({
      modules: [{ id: "erp-tables", path: "modules/erp-tables" }],
      ownsDriver: false,
    });
    const planned = removeDatabaseConnection("erp", { dryRun: true });
    const { files } = expectOk(planned, "removeDatabaseConnection dry run");
    expect(files.map((file) => path.basename(file))).to.not.include(".env");
    const diff = planned.ok
      ? planned.changes.map((change) => change.diff).join("\n")
      : "";
    expect(diff).to.match(/^-\s+"erp-tables": \{/m);
    expect(diff).to.not.match(/^-\s+"builder-db-erp": \{/m);
    expectOk(
      await ConfigureProject([{ op: "RemoveModule", id: "reports" }]),
      "RemoveModule reports",
    );
  });

  it("refuses to remove a driver another module still reads through", async () => {
    const refused = await ConfigureProject([
      { op: "RemoveModule", id: "builder-db-erp" },
    ]);
    expect(refused.ok ? "" : JSON.stringify(refused.error)).to.match(
      /still a source in the importOverrides of .*erp-tables/,
    );
  });

  it("keeps a driver ranked above the project's own database, which may be that database", async () => {
    expectOk(
      await ConfigureProject([
        {
          op: "ConfigureModule",
          id: "builder-db-erp",
          entry: { exportPriority: { [DATABASE]: 1 } },
        },
      ]),
      "ConfigureModule builder-db-erp",
    );
    expect(connectionWiring("erp")?.ownsDriver).to.equal(false);
    expectOk(
      await ConfigureProject([
        {
          op: "ConfigureModule",
          id: "builder-db-erp",
          entry: { exportPriority: { [DATABASE]: -1 } },
        },
      ]),
      "ConfigureModule builder-db-erp",
    );
    expect(connectionWiring("erp")?.ownsDriver).to.equal(true);
  });

  it("reads the wiring past a module written as a version", async () => {
    await withFileEdited(
      app.root,
      "antelope.config.ts",
      (config) =>
        config.replace(
          /modules: \{/,
          'modules: {\n    "legacy-api": "^1.5.0",',
        ),
      () => {
        expect(connectionWiring("erp")?.driver).to.equal("builder-db-erp");
      },
    );
  });

  it("refuses a plain RemoveModule while any override's source is a constant", async () => {
    await withFileEdited(
      app.root,
      "antelope.config.ts",
      (config) =>
        config.replace(
          /modules: \{/,
          'modules: {\n    other: { importOverrides: [{ interface: "@antelopejs/interface-foo", source: X_SOURCE }] },',
        ),
      async () => {
        expect(connectionWiring("erp")?.ownsDriver).to.equal(true);
        const refused = await ConfigureProject([
          { op: "RemoveModule", id: "builder-db-erp" },
        ]);
        expect(refused.ok ? "" : JSON.stringify(refused.error)).to.match(
          /still a source in the importOverrides of .*other/,
        );
      },
    );
  });

  it("keeps a driver a module written as a shorthand may read through", async () => {
    await withFileEdited(
      app.root,
      "antelope.config.ts",
      (config) => config.replace(/modules: \{/, "modules: {\n    reports,"),
      () => {
        expect(connectionWiring("erp")?.ownsDriver).to.equal(false);
      },
    );
  });

  it("keeps a driver a module written with a spread may read through, and refuses to remove it", async () => {
    await withFileEdited(
      app.root,
      "antelope.config.ts",
      (config) =>
        config.replace(
          /modules: \{/,
          `modules: {\n    reports: { ...REPORTS, importOverrides: [{ interface: "${DATABASE}", source: "builder-db-erp" }] },`,
        ),
      async () => {
        expect(connectionWiring("erp")?.ownsDriver).to.equal(false);
        const refused = await ConfigureProject([
          { op: "RemoveModule", id: "builder-db-erp" },
        ]);
        expect(refused.ok ? "" : JSON.stringify(refused.error)).to.match(
          /still a source in the importOverrides of .*reports/,
        );
      },
    );
  });

  it("reads the tables module's record from a package.json saved with a byte order mark", async () => {
    await withFileEdited(
      app.root,
      "modules/erp-tables/package.json",
      (text) => `\uFEFF${text}`,
      () => {
        expect(connectionWiring("erp")?.modules).to.deep.equal([
          { id: "erp-tables", path: "modules/erp-tables" },
        ]);
      },
    );
  });

  it("answers what a removal would change, without the URL, and changes nothing on a dry run", () => {
    const planned = removeDatabaseConnection("erp", { dryRun: true });
    const { files } = expectOk(planned, "removeDatabaseConnection dry run");
    expect(files.map((file) => path.basename(file))).to.include.members([
      "antelope.config.ts",
      ".env",
    ]);
    expect(JSON.stringify(planned)).to.not.include(PASSWORD);
    const env = planned.ok
      ? planned.changes.find((change) => path.basename(change.path) === ".env")
      : undefined;
    expect(env?.diff).to.match(/^@@ -\d+,1 \+\d+,0 @@\n-BUILDER_DB_ERP_URL=…$/);
    expect(connectionWiring("erp")?.driver).to.equal("builder-db-erp");
  });

  it("removes the connection with its tables module, folder, driver and variables, and leaves the rest as written", () => {
    expect(builderRecord(app.root, "erp-tables").database).to.deep.equal({
      connection: "erp",
    });
    const config = projectFile(app.root, "antelope.config.ts");
    fs.writeFileSync(
      path.join(app.root, "antelope.config.ts"),
      config.replace(
        /(\{\s*interface: "@antelopejs\/interface-database-catalog")/,
        '{ interface: "@antelopejs/interface-x", source: X_SOURCE }, // kept\n{ interface: "@antelopejs/interface-y", source: "provider-y" },\n$1',
      ),
    );
    expect(projectFile(app.root, "antelope.config.ts")).to.include("// kept");
    fs.writeFileSync(
      path.join(app.root, ".env.example"),
      "BUILDER_DB_ERP_URL=\nOTHER=1\n",
    );
    expectOk(removeDatabaseConnection("erp"), "removeDatabaseConnection");
    expect(connectionWiring("erp")).to.equal(undefined);
    expect(projectVariable("BUILDER_DB_ERP_URL")).to.equal(undefined);
    expect(moduleFolderExists(app.root, "erp-tables")).to.equal(false);
    const after = projectFile(app.root, "antelope.config.ts");
    expect(after).to.include("// kept");
    expect(after).to.include("source: X_SOURCE }, // kept");
    expect(after).to.include(
      '{ interface: "@antelopejs/interface-y", source: "provider-y" }',
    );
    expect(after).to.not.include("builder-db-erp");
    expect(projectFile(app.root, ".env.example")).to.equal("OTHER=1\n");
  });
});
