import fs from "node:fs";
import path from "node:path";
import type { InterfaceConnection } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  ownModuleId,
  repairDatabaseConnections,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { projectFile } from "./helpers/project-files";
import { refusalOf } from "./helpers/refusal";

const OP_TIMEOUT = 120_000;
const DATABASE = "@antelopejs/interface-database";
const CATALOG = "@antelopejs/interface-database-catalog";
const OWN = ownModuleId();
const BOTH = ["builder-db-erp", "mongodb"];

const wiring = new Map([
  [OWN, BOTH],
  ["app", BOTH],
  ["dms-database", BOTH],
  ["erp-tables", ["builder-db-erp"]],
  ["mongodb", ["mongodb"]],
  ["builder-db-erp", ["builder-db-erp"]],
]);

function lookupOf(modules: Map<string, string[]>) {
  return (moduleId: string, interfaceId: string): InterfaceConnection[] =>
    interfaceId !== DATABASE
      ? []
      : (modules.get(moduleId) ?? []).map((provider, index) => ({
          path: `${provider}.js`,
          provider,
          selected: index === 0,
        }));
}

const lookup = lookupOf(wiring);

function entry(interfaceId: string, source: string, id?: string): string {
  const named = id === undefined ? "" : `\n          id: "${id}",`;
  return `        {
          interface: "${interfaceId}",
          source: "${source}",${named}
        },`;
}

const ERP_CATALOG = entry(CATALOG, "builder-db-erp", "erp");
const OWN_PIN = entry(DATABASE, "mongodb");

const APP_BEFORE = `    app: { source: { type: "local", path: "." } },`;
const APP_AFTER = `    app: {
      source: { type: "local", path: "." },
      importOverrides: {
        "${DATABASE}": "mongodb",
      },
    },`;

function own(...overrides: string[]): string {
  return `    "${OWN}": {
      source: { type: "package", package: "@antelopejs/dms", version: "0.1.0" },
      importOverrides: [
${overrides.join("\n")}
      ],
    },`;
}

const DMS_DATABASE_BEFORE = `    "dms-database": {
      source: { type: "package", package: "@antelopejs/dms-database", version: "0.1.0" },
      config: { externalConnections: { erp: { access: "read-write" } } },
    },`;

function dmsDatabaseAfter(...overrides: string[]): string {
  return `    "dms-database": {
      source: { type: "package", package: "@antelopejs/dms-database", version: "0.1.0" },
      config: { externalConnections: { erp: { access: "read-write" } } },
      importOverrides: [
${overrides.join("\n")}
      ],
    },`;
}

function project(parts: {
  app: string;
  own: string;
  dmsDatabase: string;
}): string {
  return `import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "repair",
  modules: {
${[parts.app, parts.own, parts.dmsDatabase].filter(Boolean).join("\n")}
    mongodb: { source: { type: "package", package: "@antelopejs/mongodb", version: "1.6.0" } },
    "builder-db-erp": {
      source: { type: "package", package: "@antelopejs/postgres", version: "0.2.1" },
      exportPriority: { "${DATABASE}": -1 },
    },
    "erp-tables": {
      source: { type: "local", path: "modules/erp-tables" },
      importOverrides: { "${DATABASE}": "builder-db-erp" },
    },
  },
});
`;
}

/** A project connected before dms-database registered connections: the catalog connection and nothing else. */
const CONNECTED_BEFORE = project({
  app: APP_BEFORE,
  own: own(ERP_CATALOG),
  dmsDatabase: DMS_DATABASE_BEFORE,
});

const REPAIRED = project({
  app: APP_AFTER,
  own: own(ERP_CATALOG, OWN_PIN),
  dmsDatabase: dmsDatabaseAfter(
    OWN_PIN,
    entry(DATABASE, "builder-db-erp", "erp"),
    ERP_CATALOG,
  ),
});

let fixture: Fixture;

function configPath(): string {
  return path.join(fixture.root, "antelope.config.ts");
}

function readConfig(): string {
  return projectFile(fixture.root, "antelope.config.ts");
}

/**
 * A project connected before the connect flow registered each database with dms-database has the
 * catalog connection and nothing dms-database reads. The repair adds what is missing and leaves
 * what the console set.
 */
describe("the repair of the dms-database entries of connections made before", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    fixture = createFixture();
    fs.writeFileSync(configPath(), CONNECTED_BEFORE);
  });

  after(destroyFixture);

  it("registers the connection with dms-database and pins the modules that import interface-database", () => {
    expectOk(repairDatabaseConnections({}, lookup), "repair");
    expect(readConfig()).to.equal(REPAIRED);
  });

  it("changes nothing the second time, and answers an empty success", () => {
    expectOk(repairDatabaseConnections({}, lookup), "repair");
    const repaired = readConfig();
    const again = expectOk(
      repairDatabaseConnections({}, lookup),
      "repair again",
    );
    expect(again.files).to.deep.equal([]);
    expect(readConfig()).to.equal(repaired);
  });

  it("answers the changes of a dry run, and writes nothing", () => {
    const result = repairDatabaseConnections({ dryRun: true }, lookup);
    expect(result.ok && result.changes.length).to.be.greaterThan(0);
    expect(readConfig()).to.equal(CONNECTED_BEFORE);
  });

  it("leaves a project with no catalog connection as it is", () => {
    const bare = project({
      app: APP_BEFORE,
      own: `    "${OWN}": { source: { type: "package", package: "@antelopejs/dms", version: "0.1.0" } },`,
      dmsDatabase: DMS_DATABASE_BEFORE,
    });
    fs.writeFileSync(configPath(), bare);
    expect(
      expectOk(repairDatabaseConnections({}, lookup), "repair").files,
    ).to.deep.equal([]);
    expect(readConfig()).to.equal(bare);
  });

  it("registers every connection the module declares, behind a single own pin", () => {
    const archive = entry(CATALOG, "builder-db-archive", "archive");
    fs.writeFileSync(
      configPath(),
      project({
        app: APP_BEFORE,
        own: own(ERP_CATALOG, archive),
        dmsDatabase: DMS_DATABASE_BEFORE,
      }),
    );
    expectOk(repairDatabaseConnections({}, lookup), "repair");
    expect(readConfig()).to.include(
      dmsDatabaseAfter(
        OWN_PIN,
        entry(DATABASE, "builder-db-erp", "erp"),
        ERP_CATALOG,
        entry(DATABASE, "builder-db-archive", "archive"),
        archive,
      ),
    );
  });

  it("refuses a dms-database written as a version string, naming it, instead of reporting nothing to do", () => {
    const written = project({
      app: APP_BEFORE,
      own: own(ERP_CATALOG),
      dmsDatabase: `    "@antelopejs/dms-database": "^0.3.0",`,
    });
    fs.writeFileSync(configPath(), written);
    const result = repairDatabaseConnections({}, lookup);
    expect(result.ok).to.equal(false);
    expect(refusalOf(result)).to.include(
      'module "@antelopejs/dms-database" is not written as an object literal',
    );
    expect(readConfig()).to.equal(written);
  });

  it("refuses when a module written as a version string imports interface-database, and writes no pin", () => {
    const written = project({
      app: `${APP_BEFORE}\n    "@antelopejs/some-app": "^1.0.0",`,
      own: own(ERP_CATALOG),
      dmsDatabase: DMS_DATABASE_BEFORE,
    });
    fs.writeFileSync(configPath(), written);
    const result = repairDatabaseConnections(
      {},
      lookupOf(new Map([...wiring, ["@antelopejs/some-app", BOTH]])),
    );
    expect(result.ok).to.equal(false);
    expect(refusalOf(result)).to.include(
      'module "@antelopejs/some-app" is not written as an object literal',
    );
    expect(readConfig()).to.equal(written);
  });

  it("pins the modules alone when the project has no dms-database", () => {
    fs.writeFileSync(
      configPath(),
      project({ app: APP_BEFORE, own: own(ERP_CATALOG), dmsDatabase: "" }),
    );
    expectOk(repairDatabaseConnections({}, lookup), "repair");
    expect(readConfig()).to.equal(
      project({
        app: APP_AFTER,
        own: own(ERP_CATALOG, OWN_PIN),
        dmsDatabase: "",
      }),
    );
  });
});
