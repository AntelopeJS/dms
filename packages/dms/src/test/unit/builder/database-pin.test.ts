import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { InterfaceConnection } from "@antelopejs/interface-core";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import { dmsDatabasePin } from "../../../implementations/dms-builder/engine";

const DMS_INTERFACE = "@antelopejs/interface-dms";
const DATABASE_INTERFACE = "@antelopejs/interface-database";

function config(dmsEntry: string, driverPriority = "-1"): string {
  return `import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "pins",
  modules: {
    dms: { ${dmsEntry} },
    mongodb: { source: { type: "package", package: "@antelopejs/mongodb", version: "*" } },
    "builder-db-erp": {
      source: { type: "package", package: "@antelopejs/postgres", version: "*" },
      exportPriority: { "@antelopejs/interface-database": ${driverPriority} },
    },
  },
});
`;
}

const DMS_SOURCE = `source: { type: "local", path: "../dms" }`;

function connections(
  providers: Map<string, string[]>,
): (interfaceId: string) => InterfaceConnection[] {
  return (interfaceId) =>
    (providers.get(interfaceId) ?? []).map((provider, index) => ({
      path: `${provider}.js`,
      provider,
      selected: index === 0,
    }));
}

const PROJECT = connections(
  new Map([
    [DMS_INTERFACE, ["dms"]],
    [DATABASE_INTERFACE, ["builder-db-erp", "mongodb"]],
  ]),
);

let root: string;

function writeConfig(text: string): void {
  fs.writeFileSync(path.join(root, "antelope.config.ts"), text);
}

/**
 * A tables module pins `interface-database` to its own database and uses the DMS, so core passes
 * that pin on to the DMS. The DMS is pinned to the project's default database so it is not
 * reached with two bindings.
 */
describe("the DMS module's database pin", () => {
  before(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-database-pin-"));
    setBuilderConfig({ projectRoot: root });
  });

  after(() => {
    setBuilderConfig(undefined);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("pins the DMS to the default provider, not the first one by name", () => {
    writeConfig(config(DMS_SOURCE));
    expect(dmsDatabasePin(PROJECT)).to.deep.equal({
      module: "dms",
      provider: "mongodb",
    });
  });

  it("follows exportPriority as core does", () => {
    writeConfig(config(DMS_SOURCE, "1"));
    expect(dmsDatabasePin(PROJECT)?.provider).to.equal("builder-db-erp");
  });

  it("leaves a DMS that already pins interface-database as it is", () => {
    writeConfig(
      config(
        `${DMS_SOURCE}, importOverrides: { "@antelopejs/interface-database": "builder-db-erp" }`,
      ),
    );
    expect(dmsDatabasePin(PROJECT)).to.equal(undefined);
  });

  it("reads a priority written with separators as core does", () => {
    writeConfig(config(DMS_SOURCE, "-1_0"));
    expect(dmsDatabasePin(PROJECT)?.provider).to.equal("mongodb");
  });

  it("refuses to choose when a priority is not written as a plain number", () => {
    writeConfig(
      config(DMS_SOURCE).replace(
        '{ "@antelopejs/interface-database": -1 }',
        "{ [DATABASE]: 1 }",
      ),
    );
    expect(() => dmsDatabasePin(PROJECT)).to.throw(
      /does not say plainly which database/,
    );
  });

  it("refuses when the DMS's overrides cannot be read, instead of guessing it pins none", () => {
    writeConfig(config(`${DMS_SOURCE}, importOverrides: [authPin]`));
    expect(() => dmsDatabasePin(PROJECT)).to.throw(/not written with literals/);
  });

  it("refuses when the DMS's overrides are a constant, instead of writing over them", () => {
    writeConfig(config(`${DMS_SOURCE}, importOverrides: DMS_OVERRIDES`));
    expect(() => dmsDatabasePin(PROJECT)).to.throw(/not written with literals/);
  });

  it("refuses when a constant sits inside the DMS's overrides, instead of dropping it", () => {
    writeConfig(
      config(
        `${DMS_SOURCE}, importOverrides: [{ interface: "@antelopejs/interface-x", source: X_SOURCE }]`,
      ),
    );
    expect(() => dmsDatabasePin(PROJECT)).to.throw(/not written with literals/);
  });

  it("refuses nothing when the DMS pins the database already, beside an override it cannot read", () => {
    writeConfig(
      config(
        `${DMS_SOURCE}, importOverrides: [{ interface: "${DATABASE_INTERFACE}", source: "mongodb" }, { interface: "@antelopejs/interface-x", source: X_SOURCE }]`,
      ),
    );
    expect(dmsDatabasePin(PROJECT)).to.equal(undefined);
  });

  it("needs no pin, and refuses nothing, when the DMS provides the database itself", () => {
    writeConfig(config(`...DMS_DEFAULTS, ${DMS_SOURCE}`));
    expect(
      dmsDatabasePin(
        connections(
          new Map([
            [DMS_INTERFACE, ["dms"]],
            [DATABASE_INTERFACE, ["dms"]],
          ]),
        ),
      ),
    ).to.equal(undefined);
  });

  it("refuses to rank a provider whose entry is spread from elsewhere", () => {
    writeConfig(
      config(DMS_SOURCE).replace(/mongodb: \{/, "mongodb: { ...MONGO,"),
    );
    expect(() => dmsDatabasePin(PROJECT)).to.throw(
      /does not say plainly which database/,
    );
  });

  it("needs no pin when the project has no database of its own", () => {
    writeConfig(config(DMS_SOURCE));
    expect(
      dmsDatabasePin(connections(new Map([[DMS_INTERFACE, ["dms"]]]))),
    ).to.equal(undefined);
  });
});
