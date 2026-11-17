import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import type { ModuleEntryInput } from "@antelopejs/interface-dms-builder";
import { ConfigureModule } from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { projectFile } from "./helpers/project-files";
import { refusalOf } from "./helpers/refusal";

const OP_TIMEOUT = 120_000;
const REGISTER_ERP: ModuleEntryInput = {
  config: { externalConnections: { erp: { access: "read" } } },
};

function configWith(config: string): string {
  return `import { defineConfig } from "@antelopejs/interface-core/config";

const shared = { archive: { access: "read-write" } };

export default defineConfig({
  name: "fixture",
  modules: {
    "dms-database": {
      source: { type: "package", package: "@antelopejs/dms-database", version: "0.1.0" },
      config: { ${config} },
    },
  },
});
`;
}

let app: Fixture;

function writeConfig(config: string): string {
  const text = configWith(config);
  fs.writeFileSync(path.join(app.root, "antelope.config.ts"), text);
  return text;
}

function readConfig(): string {
  return projectFile(app.root, "antelope.config.ts");
}

/**
 * The connect flow writes `config.externalConnections.<id>.access` of dms-database. A map the
 * builder cannot read key by key holds connections it cannot see, so writing the map again would
 * lose them.
 */
describe("writing an object where the configuration holds a value the builder cannot merge", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createFixture();
  });

  after(destroyFixture);

  it("refuses a connections map written as a spread, a variable, a call or a shorthand, and writes nothing", async () => {
    for (const written of [
      'externalConnections: { ...shared, old: { access: "read-write" } }',
      "externalConnections: shared",
      "externalConnections: loadConnections()",
      "externalConnections",
    ]) {
      const before = writeConfig(written);
      const refused = await ConfigureModule("dms-database", REGISTER_ERP);
      expect(refused.ok, written).to.equal(false);
      expect(refusalOf(refused), written)
        .to.include('config.externalConnections of module "dms-database"')
        .and.to.include("plain object");
      expect(readConfig(), written).to.equal(before);
    }
  });

  it("refuses a connection written as a variable inside the map, naming its path", async () => {
    const before = writeConfig("externalConnections: { erp: erpAccess }");
    const refused = await ConfigureModule("dms-database", REGISTER_ERP);
    expect(refusalOf(refused)).to.include(
      'config.externalConnections.erp of module "dms-database"',
    );
    expect(readConfig()).to.equal(before);
  });

  it("replaces a scalar or an array held where the map is written, as it always did", async () => {
    for (const held of ['"off"', "[]", "false", "-1"]) {
      writeConfig(`externalConnections: ${held}`);
      expectOk(
        await ConfigureModule("dms-database", REGISTER_ERP),
        `replace ${held}`,
      );
      expect(readConfig(), held)
        .to.include('access: "read"')
        .and.to.not.include(`externalConnections: ${held}`);
    }
  });
});
