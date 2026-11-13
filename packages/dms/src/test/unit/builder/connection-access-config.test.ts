import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { MapResources } from "../../../implementations/dms-builder";
import { recordLaunchEnvironment } from "../../../implementations/dms-builder/engine";
import { expectOk, setConnectionAccess } from "./harness";
import {
  ACCESS_PATH,
  countries,
  READ_ONLY,
  refusalOf,
  useErpFixture,
} from "./helpers/connection-access";
import { OP_TIMEOUT } from "./mapped-database";

const DMS_DATABASE_SOURCE =
  'source: { type: "package", package: "@antelopejs/dms-database", version: "0.5.0" }';
const VARIABLES = ["ERP_ACCESS", "ERP_ACCESS_LAST"];

function productionSays(access: "read" | "read-write"): string {
  return `production: { modules: { "dms-database": { config: { externalConnections: { erp: { access: "${access}" } } } } } }`;
}

/** The refusal for `erp` when a module's access resolves to `"read"` for an environment. */
function readBecause(environment = "default", module = "dms-database"): string {
  return `${READ_ONLY}, since \`config.externalConnections.erp.access\` of the ${module} module is "read" for the "${environment}" environment`;
}

function writable() {
  return MapResources(countries(true));
}

function cleanUp(root: string): void {
  recordLaunchEnvironment(undefined);
  for (const variable of VARIABLES) {
    delete process.env[variable];
  }
  fs.rmSync(path.join(root, "antelope.dms-database.json"), { force: true });
}

describe("[unit] the access is the one core loads for the launch environment", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();
  afterEach(() => cleanUp(erp.app().root));

  it("reads the launch environment's member of environments, and no other", async () => {
    setConnectionAccess(
      { erp: "read-write" },
      `  environments: { ${productionSays("read")} },\n`,
    );
    expectOk(await writable(), "writable mapping on the default launch");
    recordLaunchEnvironment("production");
    expect(refusalOf(await writable())).to.include(
      `${READ_ONLY}, since \`config.externalConnections.erp.access\` of the dms-database module is "read" for the "production" environment`,
    );
  });

  it("is read-only when only another environment sets it to read-write", async () => {
    setConnectionAccess(
      {},
      `  environments: { ${productionSays("read-write")} },\n`,
    );
    expect(refusalOf(await writable())).to.include(
      `${READ_ONLY}, since \`config.externalConnections.erp.access\` of the dms-database module is not set, and "read" is the default, for the "default" environment`,
    );
  });

  it("reads an environments member written through a spread", async () => {
    setConnectionAccess(
      { erp: "read-write" },
      `  environments: { ...{ ${productionSays("read")} } },\n`,
    );
    recordLaunchEnvironment("production");
    expect(refusalOf(await writable())).to.include(readBecause("production"));
  });

  it("reads an environments member under a computed key", async () => {
    setConnectionAccess(
      { erp: "read-write" },
      `  environments: { ["production"]: { modules: { "dms-database": { config: { externalConnections: { erp: { access: "read" } } } } } } },\n`,
    );
    recordLaunchEnvironment("production");
    expect(refusalOf(await writable())).to.include(readBecause("production"));
  });

  it("reads antelope.dms-database.json over the entry, as core merges it", async () => {
    setConnectionAccess({ erp: "read-write" });
    erp
      .app()
      .write(
        "../antelope.dms-database.json",
        JSON.stringify({ externalConnections: { erp: { access: "read" } } }),
      );
    expect(refusalOf(await writable())).to.include(readBecause());
  });

  it("is read-only when antelope.dms-database.json replaces the connection with a value that is not an object", async () => {
    setConnectionAccess({ erp: "read-write" });
    erp
      .app()
      .write(
        "../antelope.dms-database.json",
        JSON.stringify({ externalConnections: { erp: "read" } }),
      );
    expect(refusalOf(await writable())).to.include(
      `${READ_ONLY}, since \`config.externalConnections.erp.access\` of the dms-database module is not under a plain object for the "default" environment`,
    );
  });

  it("is read-only, saying so, when the configuration cannot be resolved", async () => {
    erp
      .app()
      .write(
        "../antelope.config.ts",
        'throw new Error("a broken configuration");\n',
      );
    expect(refusalOf(await writable())).to.include(
      'the access of connection "erp" could not be checked, since the project configuration could not be loaded: a broken configuration. Fix antelope.config.ts so core can load it',
    );
  });
});

describe("[unit] the dms-database module is the one core loads", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();
  afterEach(() => cleanUp(erp.app().root));

  it("reads the entry keyed by the dms-database package name", async () => {
    erp.writeModules([
      '"@antelopejs/dms-database": { version: "0.5.0", config: { externalConnections: { erp: { access: "read-write" } } } },',
    ]);
    expectOk(await writable(), "writable mapping");
  });

  it("skips a disabled dms-database entry", async () => {
    erp.writeModules([
      '"dms-database-next": { disabled: true, source: { type: "package", package: "@antelopejs/dms-database", version: "0.5.0" }, config: { externalConnections: { erp: { access: "read-write" } } } },',
      `"dms-database": { ${DMS_DATABASE_SOURCE}, config: { externalConnections: { erp: { access: "read" } } } },`,
    ]);
    expect(refusalOf(await writable())).to.include(readBecause());
  });

  it("follows an environment that swaps which dms-database entry is disabled", async () => {
    erp.writeModules(
      [
        `"dms-database": { ${DMS_DATABASE_SOURCE}, config: { externalConnections: { erp: { access: "read-write" } } } },`,
        '"dms-database-ro": { disabled: true, source: { type: "package", package: "@antelopejs/dms-database", version: "0.5.0" }, config: { externalConnections: { erp: { access: "read" } } } },',
      ],
      [
        'environments: { production: { modules: { "dms-database": { disabled: true }, "dms-database-ro": { disabled: false } } } },',
      ],
    );
    expectOk(await writable(), "writable mapping on the default launch");
    recordLaunchEnvironment("production");
    expect(refusalOf(await writable())).to.include(
      readBecause("production", "dms-database-ro"),
    );
  });
});

describe("[unit] envOverrides apply as core applies them", function () {
  this.timeout(OP_TIMEOUT);
  const erp = useErpFixture();
  afterEach(() => cleanUp(erp.app().root));

  it("follows a variable set in the process", async () => {
    setConnectionAccess(
      { erp: "read-write" },
      `  envOverrides: { ERP_ACCESS: "${ACCESS_PATH}" },\n`,
    );
    process.env.ERP_ACCESS = "read";
    expect(refusalOf(await writable())).to.include(readBecause());
    process.env.ERP_ACCESS = "read-write";
    expectOk(await writable(), "writable mapping");
  });

  it("follows a variable an environment declares", async () => {
    setConnectionAccess(
      { erp: "read-write" },
      `  environments: { default: { envOverrides: { ERP_ACCESS: "${ACCESS_PATH}" } } },\n`,
    );
    process.env.ERP_ACCESS = "read";
    expect(refusalOf(await writable())).to.include(readBecause());
  });

  it("keeps the root's order when an environment declares a variable again", async () => {
    setConnectionAccess(
      { erp: "read" },
      `  envOverrides: { ERP_ACCESS: "${ACCESS_PATH}", ERP_ACCESS_LAST: "${ACCESS_PATH}" },\n  environments: { default: { envOverrides: { ERP_ACCESS: "${ACCESS_PATH}" } } },\n`,
    );
    process.env.ERP_ACCESS = "read-write";
    process.env.ERP_ACCESS_LAST = "read";
    expect(refusalOf(await writable())).to.include(readBecause());
  });

  it("drops a root variable an environment points elsewhere", async () => {
    setConnectionAccess(
      { erp: "read" },
      `  envOverrides: { ERP_ACCESS: "${ACCESS_PATH}" },\n  environments: { default: { envOverrides: { ERP_ACCESS: "modules.dms-database.config.unused" } } },\n`,
    );
    process.env.ERP_ACCESS = "read-write";
    expect(refusalOf(await writable())).to.include(readBecause());
  });

  it("follows a variable under a computed key", async () => {
    setConnectionAccess(
      { erp: "read-write" },
      `  envOverrides: { ["ERP_ACCESS"]: "${ACCESS_PATH}" },\n`,
    );
    process.env.ERP_ACCESS = "read";
    expect(refusalOf(await writable())).to.include(readBecause());
  });

  it("never reaches a connection id holding a dot, which core splits", async () => {
    setConnectionAccess(
      { erp: "read-write", "erp.v2": "read" },
      '  envOverrides: { ERP_ACCESS: "modules.dms-database.config.externalConnections.erp.v2.access" },\n',
    );
    process.env.ERP_ACCESS = "read-write";
    expect(
      refusalOf(
        await MapResources({ ...countries(true), connection: "erp.v2" }),
      ),
    ).to.include(
      'connection "erp.v2" is read-only, since `config.externalConnections.erp.v2.access` of the dms-database module is "read" for the "default" environment',
    );
  });
});
