import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  configureProjectWithVariables,
  projectVariable,
  setConnectionUrl,
} from "../../../implementations/dms-builder/engine";
import { createFixture, destroyFixture, expectOk } from "./harness";
import { gitInit } from "./helpers/processes";

const OP_TIMEOUT = 120_000;
const CATALOG = "@antelopejs/interface-database-catalog";
const DATABASE = "@antelopejs/interface-database";
const VARIABLE = "BUILDER_DB_ERP_URL";
const URL = "mysql://reader:pw@db.example:3306/erp";

/** Fails on an edit that writes a MySQL host mysql2 would not read, or refuses one it reads. */
describe("editing the URL of a MySQL connection", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    const app = createFixture({ modules: ["dms-builder", "dms-ai"] });
    gitInit(app.root);
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    const catalog = {
      importOverrides: [
        { interface: CATALOG, source: "builder-db-erp", id: "erp" },
      ],
    };
    expectOk(
      configureProjectWithVariables(
        [
          {
            op: "AddModule",
            id: "builder-db-erp",
            entry: {
              source: {
                type: "package",
                package: "@antelopejs/mysql",
                version: "^0.1.0",
              },
              config: { mode: "external" },
              env: { url: VARIABLE },
              exportPriority: { [DATABASE]: -1 },
            },
          },
          {
            op: "CreateLocalModule",
            id: "erp-tables",
            path: "modules/erp-tables",
            entry: {
              importOverrides: [
                { interface: DATABASE, source: "builder-db-erp" },
              ],
            },
            connection: "erp",
          },
          { op: "ConfigureModule", id: "dms-builder", entry: catalog },
          { op: "ConfigureModule", id: "dms-ai", entry: catalog },
        ],
        [{ name: VARIABLE, value: URL }],
      ),
      "connecting erp",
    );
  });

  after(destroyFixture);

  it("refuses a socket path as its host, and leaves .env as it was", () => {
    for (const host of [
      "%2Fvar%2Frun%2Fmysqld",
      "%2fvar%2frun%2fmysqld.sock",
    ]) {
      const result = setConnectionUrl("erp", `mysql://reader:pw@${host}/erp`);
      expect(result.ok ? "ok" : result.error, host).to.deep.equal({
        code: "invalid_config",
        issues: [
          {
            pointer: "",
            message:
              "the host is a name or an address only: no spaces, port or path",
          },
        ],
      });
      expect(projectVariable(VARIABLE)).to.equal(URL);
    }
  });

  it("writes a host name, an IPv6 address, or a socket given as socketPath", () => {
    for (const url of [
      "mysql://reader:pw@db2.example:3306/erp",
      "mysql://reader:pw@[::1]:3306/erp",
      "mysql:///erp?socketPath=%2Fvar%2Frun%2Fmysqld%2Fmysqld.sock",
    ]) {
      expectOk(setConnectionUrl("erp", url), url);
      expect(projectVariable(VARIABLE)).to.equal(url);
    }
  });
});
