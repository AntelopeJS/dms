import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { ConfigureModule } from "../../../implementations/dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 120_000;
const DATABASE = "@antelopejs/interface-database";

const ARCHIVE_CONNECTION = `        {
          interface: "${DATABASE}",
          source: "postgres-erp",
          id: "archive",
        },`;

function configWith(entry: string): string {
  return `import { defineConfig } from "@antelopejs/interface-core/config";

export default defineConfig({
  name: "fixture",
  modules: {
    "dms-database": {
      source: { type: "package", package: "@antelopejs/dms-database", version: "0.1.0" },
${entry}
    },
  },
});
`;
}

let app: Fixture;

function writeConfig(entry: string): void {
  fs.writeFileSync(
    path.join(app.root, "antelope.config.ts"),
    configWith(entry),
  );
}

function readConfig(): string {
  return projectFile(app.root, "antelope.config.ts");
}

/**
 * Registering a connection with dms-database writes beside the connections it already holds. A
 * write that puts a plain pin after a named connection, which a plain import would then not reach,
 * or that replaces the connections map instead of joining it, fails these cases.
 */
describe("registering a connection with dms-database", function () {
  this.timeout(OP_TIMEOUT);

  beforeEach(() => {
    app = createFixture();
  });

  after(destroyFixture);

  it("writes a plain pin ahead of a connection that has an id", async () => {
    writeConfig(`      importOverrides: [\n${ARCHIVE_CONNECTION}\n      ],`);
    expectOk(
      await ConfigureModule("dms-database", {
        importOverrides: [{ interface: DATABASE, source: "mongodb" }],
      }),
      "pin dms-database",
    );
    expect(readConfig()).to.equal(
      configWith(`      importOverrides: [
        {
          interface: "${DATABASE}",
          source: "mongodb",
        },
${ARCHIVE_CONNECTION}
      ],`),
    );
  });

  it("adds a nested config key beside the ones the module already has", async () => {
    const archive = `          archive: {
            access: "read-write",
          },`;
    const withConnections = (connections: string) => `      config: {
        externalConnections: {
${connections}
        },
      },`;
    writeConfig(withConnections(archive));
    expectOk(
      await ConfigureModule("dms-database", {
        config: { externalConnections: { erp: { access: "read" } } },
      }),
      "register erp",
    );
    expect(readConfig()).to.equal(
      configWith(
        withConnections(`${archive}
          erp: {
            access: "read",
          },`),
      ),
    );
  });
});
