import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { ListEntryConnections } from "../../../implementations/dms-builder";
import { createFixture, destroyFixture, type Fixture } from "./harness";
import { projectFile } from "./helpers/project-files";
import { refusalOf } from "./helpers/refusal";

const OP_TIMEOUT = 60_000;
const DATABASE = "@antelopejs/interface-database";
const CATALOG = "@antelopejs/interface-database-catalog";

const PROJECT_CONFIG = `import { defineConfig } from "@antelopejs/interface-core/config";

const SHARED_ENTRY = { source: { type: "package", package: "@antelopejs/dms-builder", version: "0.1.0" } };
const SHARED_OVERRIDES = [{ interface: "${CATALOG}", source: "postgres-erp", id: "erp" }];

export default defineConfig({
  name: "app",
  modules: {
    dms: {
      source: { type: "package", package: "@antelopejs/dms", version: "0.1.0" },
      importOverrides: [
        { interface: "${DATABASE}", source: "mongodb" },
        { interface: "@antelopejs/interface-auth", source: "auth-jwt" },
        { interface: "${CATALOG}", source: "postgres-erp", id: "erp" },
      ],
    },
    "dms-builder": {
      source: { type: "package", package: "@antelopejs/dms-builder", version: "0.1.0" },
      disabled: true,
      importOverrides: [
        { interface: "${CATALOG}", source: "postgres-archive", id: "archive" },
      ],
    },
    "dms-database": {
      source: { type: "package", package: "@antelopejs/dms-database", version: "0.1.0" },
      config: { externalConnections: { erp: { access: "read-write" } } },
    },
    legacy: SHARED_ENTRY,
    shared: {
      source: { type: "package", package: "@antelopejs/dms-assistant", version: "0.1.0" },
      importOverrides: SHARED_OVERRIDES,
    },
  },
});
`;

let app: Fixture;

function readConfig(): string {
  return projectFile(app.root, "antelope.config.ts");
}

/**
 * A one-time migration moves the connections of a disabled builder entry onto the DMS's entry, so
 * it must read every binding as written. A reader that skips a disabled entry, drops a binding it
 * cannot read, or writes, fails these cases.
 */
describe("listing the database connections of a module entry", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    app = createFixture();
    fs.writeFileSync(path.join(app.root, "antelope.config.ts"), PROJECT_CONFIG);
  });

  after(destroyFixture);

  it("lists a loaded entry's database bindings in order, with each connection's access", async () => {
    expect(await ListEntryConnections("dms")).to.deep.equal({
      ok: true,
      data: [
        { interface: DATABASE, source: "mongodb" },
        {
          interface: CATALOG,
          source: "postgres-erp",
          id: "erp",
          access: "read-write",
        },
      ],
      changes: [],
    });
  });

  it("lists a disabled entry, a connection dms-database does not register reading as read", async () => {
    const listed = await ListEntryConnections("dms-builder");
    expect(listed.ok && listed.data).to.deep.equal([
      {
        interface: CATALOG,
        source: "postgres-archive",
        id: "archive",
        access: "read",
      },
    ]);
  });

  it("refuses an entry, or its importOverrides, written as a variable, naming where", async () => {
    expect(refusalOf(await ListEntryConnections("legacy"))).to.include(
      'module "legacy" is held in a way the builder cannot read',
    );
    expect(refusalOf(await ListEntryConnections("shared"))).to.include(
      'importOverrides of module "shared" is held in a way the builder cannot read',
    );
  });

  it("answers not_found for an entry the configuration does not have, and writes nothing", async () => {
    expect(await ListEntryConnections("dms-assistant")).to.deep.equal({
      ok: false,
      error: { code: "not_found", ref: "dms-assistant" },
    });
    expect(readConfig()).to.equal(PROJECT_CONFIG);
  });
});
