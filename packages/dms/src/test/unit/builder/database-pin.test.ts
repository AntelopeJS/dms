import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import { databasePins } from "../../../implementations/dms-builder/engine/database-pin";
import { ownModuleId } from "../../../implementations/dms-builder/engine/own-connections";

const DATABASE_INTERFACE = "@antelopejs/interface-database";

type Lookup = NonNullable<Parameters<typeof databasePins>[0]>;

function config(dmsEntry: string, driverPriority = "-1", others = ""): string {
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
${others}
  },
});
`;
}

const DMS_SOURCE = `source: { type: "local", path: "../dms" }`;
const LOCAL_APP = `    app: { source: { type: "local", path: "." } },`;

/** A lookup answering each module's connections to `interface-database` by the providers it lists. */
function connections(providersOf: Map<string, string[]>): Lookup {
  return (moduleId, interfaceId) =>
    interfaceId !== DATABASE_INTERFACE
      ? []
      : (providersOf.get(moduleId) ?? []).map((provider, index) => ({
          path: `${provider}.js`,
          provider,
          selected: index === 0,
        }));
}

const BOTH = ["builder-db-erp", "mongodb"];

const PROJECT = connections(
  new Map([
    [ownModuleId(), BOTH],
    ["dms", BOTH],
    ["mongodb", ["mongodb"]],
    ["builder-db-erp", ["builder-db-erp"]],
  ]),
);

let root: string;

function writeConfig(text: string): void {
  fs.writeFileSync(path.join(root, "antelope.config.ts"), text);
}

/**
 * A tables module pins `interface-database` to its own database and the modules that import it
 * receive that pin, so each of them has to be pinned to the project's default database or it is
 * reached with two bindings.
 */
describe("the database pins of the modules that import interface-database", () => {
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
    expect(databasePins(PROJECT)).to.deep.equal({
      ownDatabase: "mongodb",
      pins: [{ module: "dms", provider: "mongodb" }],
    });
  });

  it("follows exportPriority as core does", () => {
    writeConfig(config(DMS_SOURCE, "1"));
    expect(databasePins(PROJECT)).to.deep.equal({
      ownDatabase: "builder-db-erp",
      pins: [{ module: "dms", provider: "builder-db-erp" }],
    });
  });

  it("leaves a DMS that already pins interface-database as it is", () => {
    writeConfig(
      config(
        `${DMS_SOURCE}, importOverrides: { "@antelopejs/interface-database": "builder-db-erp" }`,
      ),
    );
    expect(databasePins(PROJECT)).to.deep.equal({
      ownDatabase: "mongodb",
      pins: [],
    });
  });

  it("reads a priority written with separators as core does", () => {
    writeConfig(config(DMS_SOURCE, "-1_0"));
    expect(databasePins(PROJECT).ownDatabase).to.equal("mongodb");
  });

  it("refuses to choose when a priority is not written as a plain number", () => {
    writeConfig(
      config(DMS_SOURCE).replace(
        '{ "@antelopejs/interface-database": -1 }',
        "{ [DATABASE]: 1 }",
      ),
    );
    expect(() => databasePins(PROJECT)).to.throw(
      /does not say plainly which database/,
    );
  });

  it("refuses when the DMS's overrides cannot be read, instead of guessing it pins none", () => {
    writeConfig(config(`${DMS_SOURCE}, importOverrides: [authPin]`));
    expect(() => databasePins(PROJECT)).to.throw(/not written with literals/);
  });

  it("refuses when the DMS's overrides are a constant, instead of writing over them", () => {
    writeConfig(config(`${DMS_SOURCE}, importOverrides: DMS_OVERRIDES`));
    expect(() => databasePins(PROJECT)).to.throw(/not written with literals/);
  });

  it("refuses when a constant sits inside the DMS's overrides, instead of dropping it", () => {
    writeConfig(
      config(
        `${DMS_SOURCE}, importOverrides: [{ interface: "@antelopejs/interface-x", source: X_SOURCE }]`,
      ),
    );
    expect(() => databasePins(PROJECT)).to.throw(/not written with literals/);
  });

  it("refuses nothing when the DMS pins the database already, beside an override it cannot read", () => {
    writeConfig(
      config(
        `${DMS_SOURCE}, importOverrides: [{ interface: "${DATABASE_INTERFACE}", source: "mongodb" }, { interface: "@antelopejs/interface-x", source: X_SOURCE }]`,
      ),
    );
    expect(databasePins(PROJECT).pins).to.deep.equal([]);
  });

  it("needs no pin, and refuses nothing, when the DMS provides the database itself", () => {
    writeConfig(config(`...DMS_DEFAULTS, ${DMS_SOURCE}`));
    const dmsOnly = new Map([
      [ownModuleId(), ["dms"]],
      ["dms", ["dms"]],
    ]);
    expect(databasePins(connections(dmsOnly))).to.deep.equal({
      ownDatabase: "dms",
      pins: [],
    });
  });

  it("refuses to rank a provider whose entry is spread from elsewhere", () => {
    writeConfig(
      config(DMS_SOURCE).replace(/mongodb: \{/, "mongodb: { ...MONGO,"),
    );
    expect(() => databasePins(PROJECT)).to.throw(
      /does not say plainly which database/,
    );
  });

  it("needs no pin when the project has no database of its own", () => {
    writeConfig(config(DMS_SOURCE));
    expect(databasePins(connections(new Map([["dms", []]])))).to.deep.equal({
      pins: [],
    });
  });

  it("refuses when a module is keyed by a computed name, which may be one that imports interface-database", () => {
    writeConfig(
      config(
        DMS_SOURCE,
        "-1",
        `    [REPORTS_KEY]: { source: { type: "local", path: "../reports" } },`,
      ),
    );
    expect(() => databasePins(PROJECT)).to.throw(
      /computed name, a method or an accessor/,
    );
  });

  it("pins each module that imports interface-database, and no provider, no pinned module and no other", () => {
    writeConfig(
      config(
        DMS_SOURCE,
        "-1",
        `${LOCAL_APP}
    reports: {
      source: { type: "local", path: "../reports" },
      importOverrides: { "${DATABASE_INTERFACE}": "builder-db-erp" },
    },
    docs: { source: { type: "local", path: "../docs" } },`,
      ),
    );
    const importing = new Map([
      [ownModuleId(), BOTH],
      ["dms", BOTH],
      ["app", BOTH],
      ["reports", BOTH],
      ["mongodb", ["mongodb"]],
      ["builder-db-erp", ["builder-db-erp"]],
    ]);
    expect(databasePins(connections(importing))).to.deep.equal({
      ownDatabase: "mongodb",
      pins: [
        { module: "dms", provider: "mongodb" },
        { module: "app", provider: "mongodb" },
      ],
    });
  });

  it("still pins a module that has a named connection to interface-database and no plain pin", () => {
    writeConfig(
      config(
        DMS_SOURCE,
        "-1",
        `    "dms-database": {
      source: { type: "package", package: "@antelopejs/dms-database", version: "*" },
      importOverrides: [{ interface: "${DATABASE_INTERFACE}", source: "builder-db-erp", id: "erp" }],
    },`,
      ),
    );
    const importing = new Map([
      [ownModuleId(), BOTH],
      ["dms-database", BOTH],
      ["mongodb", ["mongodb"]],
      ["builder-db-erp", ["builder-db-erp"]],
    ]);
    expect(databasePins(connections(importing)).pins).to.deep.equal([
      { module: "dms-database", provider: "mongodb" },
    ]);
  });

  describe("a module whose entry the builder cannot write a pin into", () => {
    const wiringWith = (module: string) =>
      connections(
        new Map([
          [ownModuleId(), BOTH],
          ["dms", BOTH],
          [module, BOTH],
          ["mongodb", ["mongodb"]],
          ["builder-db-erp", ["builder-db-erp"]],
        ]),
      );

    it("is refused by name when it is written as a version string and imports interface-database", () => {
      writeConfig(
        config(DMS_SOURCE, "-1", `    "@antelopejs/some-app": "^1.0.0",`),
      );
      expect(() => databasePins(wiringWith("@antelopejs/some-app"))).to.throw(
        /module "@antelopejs\/some-app".*as an object with the pin/,
      );
    });

    it("is refused by name when it is written with a spread and imports interface-database", () => {
      writeConfig(
        config(
          DMS_SOURCE,
          "-1",
          `    reports: { ...SHARED, source: { type: "local", path: "../reports" } },`,
        ),
      );
      expect(() => databasePins(wiringWith("reports"))).to.throw(
        /module "reports".*as an object with the pin/,
      );
    });

    /**
     * A spread decides nothing about a key written after it, so a pin there is the pin the module
     * runs with. A detector that refuses every entry with a spread fails the first case, and one
     * that takes a pin written before the spread for a pin fails the second.
     */
    it("counts a plain pin written after the last spread, or computed name, as the module's pin", () => {
      const pin = `importOverrides: { "${DATABASE_INTERFACE}": "mongodb" }`;
      for (const written of [
        `{ ...SHARED, ${pin} }`,
        `{ ...SHARED, importOverrides: [{ interface: "${DATABASE_INTERFACE}", source: "mongodb" }] }`,
        `{ ...SHARED, ...MORE, ${pin} }`,
        `{ [KEY]: 1, ${pin} }`,
      ]) {
        writeConfig(config(DMS_SOURCE, "-1", `    reports: ${written},`));
        expect(databasePins(wiringWith("reports")).pins, written).to.deep.equal(
          [{ module: "dms", provider: "mongodb" }],
        );
      }
    });

    it("still refuses an entry with a spread whose pin is not one that wins, and says what to write", () => {
      const pin = `importOverrides: { "${DATABASE_INTERFACE}": "mongodb" }`;
      for (const written of [
        `{ ${pin}, ...SHARED }`,
        `{ ${pin}, [KEY]: 1 }`,
        `{ ...SHARED, importOverrides: { "@antelopejs/interface-x": "mongodb" } }`,
        `{ ...SHARED, importOverrides: [{ interface: "${DATABASE_INTERFACE}", source: "mongodb", id: "erp" }] }`,
        "{ ...SHARED, importOverrides }",
        "{ ...SHARED, importOverrides: PINS }",
      ]) {
        writeConfig(config(DMS_SOURCE, "-1", `    reports: ${written},`));
        expect(() => databasePins(wiringWith("reports")), written).to.throw(
          /module "reports".*as an object with the pin/,
        );
      }
    });

    it("is left alone when it imports no interface-database, or provides it itself", () => {
      writeConfig(
        config(
          DMS_SOURCE,
          "-1",
          `    "@antelopejs/some-app": "^1.0.0",
    reports: { ...SHARED, source: { type: "local", path: "../reports" } },`,
        ),
      );
      const providing = connections(
        new Map([
          [ownModuleId(), BOTH],
          ["dms", BOTH],
          ["reports", ["reports"]],
          ["mongodb", ["mongodb"]],
          ["builder-db-erp", ["builder-db-erp"]],
        ]),
      );
      expect(databasePins(providing).pins).to.deep.equal([
        { module: "dms", provider: "mongodb" },
      ]);
    });
  });
});
