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
const DMS_DATABASE = "dms-database";
const REGISTER_ERP: ModuleEntryInput = {
  config: { externalConnections: { erp: { access: "read" } } },
};

function configWith(entryMembers: string): string {
  return `import { defineConfig } from "@antelopejs/interface-core/config";

const KEY = "externalConnections";
const url = "postgres://old";
const hosts = ["old"];
const disabledExports = ["old"];

export default defineConfig({
  name: "fixture",
  modules: {
    "${DMS_DATABASE}": {
      source: { type: "package", package: "@antelopejs/dms-database", version: "0.1.0" },
      ${entryMembers}
    },
  },
});
`;
}

let app: Fixture;

function writeConfig(entryMembers: string): string {
  const text = configWith(entryMembers);
  fs.writeFileSync(path.join(app.root, "antelope.config.ts"), text);
  return text;
}

function readConfig(): string {
  return projectFile(app.root, "antelope.config.ts");
}

/**
 * Before the builder writes a key it looks the key up among the members of its owner. A member
 * whose name it cannot read may be that key, so writing a second one beside it would let the later
 * key win at runtime and drop what the first held. A writer that looks keys up among plain names
 * only fails these cases: it appends a second key and answers ok.
 */
describe("writing a key beside a member whose name the builder cannot read", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createFixture();
  });

  after(destroyFixture);

  it("refuses to write the connections map beside a computed name, a method or an accessor, and writes nothing", async () => {
    for (const held of [
      '[KEY]: { old: { access: "read-write" } }',
      '["externalConnections"]: { old: { access: "read-write" } }',
      "externalConnections() { return {}; }",
      "get externalConnections() { return {}; }",
      "set externalConnections(value) {}",
    ]) {
      const before = writeConfig(`config: { ${held} },`);
      const refused = await ConfigureModule(DMS_DATABASE, REGISTER_ERP);
      expect(refused.ok, held).to.equal(false);
      expect(refusalOf(refused), held).to.include(
        `config.externalConnections of module "${DMS_DATABASE}"`,
      );
      expect(readConfig(), held).to.equal(before);
    }
  });

  it("refuses to write a scalar beside a computed name, naming its path", async () => {
    const before = writeConfig('config: { ["url"]: "postgres://old" },');
    const refused = await ConfigureModule(DMS_DATABASE, {
      config: { url: "postgres://new" },
    });
    expect(refusalOf(refused)).to.include(
      `config.url of module "${DMS_DATABASE}"`,
    );
    expect(readConfig()).to.equal(before);
  });

  it("refuses to create the config of an entry that holds one under a computed name", async () => {
    const before = writeConfig('["config"]: { old: 1 },');
    const refused = await ConfigureModule(DMS_DATABASE, REGISTER_ERP);
    expect(refusalOf(refused)).to.include(`config of module "${DMS_DATABASE}"`);
    expect(readConfig()).to.equal(before);
  });

  it("replaces a shorthand member with an assignment when it writes a scalar, and keeps the others", async () => {
    writeConfig('config: { url, database: "d" },');
    expectOk(
      await ConfigureModule(DMS_DATABASE, {
        config: { url: "postgres://new" },
      }),
      "scalar over a shorthand",
    );
    const text = readConfig();
    expect(text).to.include('url: "postgres://new"');
    expect(text).to.include('database: "d"');
    expect(text.match(/\burl[:,]/g)).to.have.length(1);
  });

  it("replaces a shorthand member with an assignment when it writes an array", async () => {
    writeConfig("config: { hosts },");
    expectOk(
      await ConfigureModule(DMS_DATABASE, { config: { hosts: ["a", "b"] } }),
      "array over a shorthand",
    );
    expect(readConfig()).to.include('hosts: ["a", "b"]');
    expect(readConfig().match(/\bhosts[:,]/g)).to.have.length(1);
  });

  it("refuses to merge an object into a shorthand member, whose value is a variable it cannot read", async () => {
    for (const held of ["config", "disabledExports"]) {
      const before = writeConfig(`${held},`);
      const refused = await ConfigureModule(DMS_DATABASE, {
        ...REGISTER_ERP,
        disabledExports: ["x"],
      });
      expect(refused.ok, held).to.equal(false);
      expect(refusalOf(refused), held).to.include(
        `${held} of module "${DMS_DATABASE}"`,
      );
      expect(readConfig(), held).to.equal(before);
    }
  });
});

/**
 * A refusal tells the owner what to fix, so it names where: the module and the key path from its
 * entry. A refusal that says only that something "in the configuration" is not plain fails these
 * cases.
 */
describe("refusing a value written as a variable", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createFixture();
  });

  after(destroyFixture);

  it("names the module and the key of a config written as a variable", async () => {
    const before = writeConfig("config: SHARED_CONFIG,");
    const refused = await ConfigureModule(DMS_DATABASE, REGISTER_ERP);
    expect(refused.ok).to.equal(false);
    expect(refusalOf(refused)).to.include(`config of module "${DMS_DATABASE}"`);
    expect(readConfig()).to.equal(before);
  });

  it("names the module and the key of an exportPriority written as a variable", async () => {
    const before = writeConfig("exportPriority: PRIORITIES,");
    const refused = await ConfigureModule(DMS_DATABASE, {
      exportPriority: { "@antelopejs/interface-database": 1 },
    });
    expect(refusalOf(refused)).to.include(
      `exportPriority of module "${DMS_DATABASE}"`,
    );
    expect(readConfig()).to.equal(before);
  });

  it("names the module written as a variable", async () => {
    const before = configWith("").replace(
      /"dms-database": \{[^]*?\n    \},/,
      `"${DMS_DATABASE}": DMS_ENTRY,`,
    );
    fs.writeFileSync(path.join(app.root, "antelope.config.ts"), before);
    const refused = await ConfigureModule(DMS_DATABASE, REGISTER_ERP);
    expect(refusalOf(refused)).to.include(`module "${DMS_DATABASE}"`);
    expect(readConfig()).to.equal(before);
  });
});
