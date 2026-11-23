import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { startBuilder } from "../../../builder";
import { getBuilderConfig, setBuilderConfig } from "../../../config";
import {
  configureProjectWithVariables,
  envFileText,
  recordInheritedVariables,
  setConnectionUrl,
  setProjectVariable,
} from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { gitInit } from "./helpers/processes";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 120_000;
const CATALOG = "@antelopejs/interface-database-catalog";
const DATABASE = "@antelopejs/interface-database";
const VARIABLE = "BUILDER_DB_ERP_URL";
const URL = "postgres://reader:secret@db.example:5432/erp";
const SHELL_URL = "postgres://other:secret@shell.example:5432/erp";
const SHADOWED = new RegExp(
  `project runs with a value of ${VARIABLE} it did not load from \\.env`,
);

let app: Fixture;

function envFile(): string {
  return path.join(app.root, ".env");
}

/** Starts the project as core does: `.env` loaded into an environment that may hold the variable already. */
function startWith(inherited: string | undefined): void {
  if (inherited === undefined) {
    delete process.env[VARIABLE];
  } else {
    process.env[VARIABLE] = inherited;
  }
  recordInheritedVariables(envFileText());
}

function refusal(write: () => void): string {
  try {
    write();
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    throw error;
  }
  throw new Error("the write was expected to be refused");
}

describe("the URL the builder writes for a connection variable the starting environment already sets", function () {
  this.timeout(OP_TIMEOUT);

  before(() => {
    app = createFixture({ modules: ["dms-builder"] });
    gitInit(app.root);
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    startWith(undefined);
    expectOk(
      configureProjectWithVariables(
        [
          {
            op: "AddModule",
            id: "builder-db-erp",
            entry: {
              source: {
                type: "package",
                package: "@antelopejs/postgres",
                version: "^0.2.1",
              },
              config: { mode: "external" },
              env: { url: VARIABLE },
              exportPriority: { [DATABASE]: -1 },
            },
          },
          {
            op: "ConfigureModule",
            id: "dms-builder",
            entry: {
              importOverrides: [
                { interface: CATALOG, source: "builder-db-erp", id: "erp" },
              ],
            },
          },
        ],
        [{ name: VARIABLE, value: URL }],
      ),
      "connecting erp",
    );
  });

  after(() => {
    startWith(undefined);
    destroyFixture();
  });

  it("reports the variable instead of writing a URL the project would not load", () => {
    startWith(SHELL_URL);
    const before = projectFile(app.root, ".env");
    const result = setConnectionUrl(
      "erp",
      "postgres://reader@db.example:5432/erp2",
    );
    expect(result.ok).to.equal(false);
    expect(JSON.stringify(result)).to.match(SHADOWED);
    expect(projectFile(app.root, ".env")).to.equal(before);
    expect(refusal(() => setProjectVariable(VARIABLE, URL))).to.match(SHADOWED);
  });

  it("records the variables at each start of the builder, against the .env it loaded", async () => {
    const config = getBuilderConfig();
    setBuilderConfig({ ...config, enabled: true });
    try {
      startWith(undefined);
      process.env[VARIABLE] = SHELL_URL;
      await startBuilder(false, "default");
      expect(refusal(() => setProjectVariable(VARIABLE, URL))).to.match(
        SHADOWED,
      );
      fs.writeFileSync(envFile(), `${VARIABLE}="${SHELL_URL}"\n`);
      await startBuilder(false, "default");
      setProjectVariable(VARIABLE, URL);
    } finally {
      setBuilderConfig(config);
    }
    expect(projectFile(app.root, ".env")).to.equal(`${VARIABLE}="${URL}"\n`);
  });

  it("writes the value the starting environment holds already, which the project loads", () => {
    startWith(SHELL_URL);
    setProjectVariable(VARIABLE, SHELL_URL);
    expect(projectFile(app.root, ".env")).to.equal(
      `${VARIABLE}="${SHELL_URL}"\n`,
    );
  });

  it("writes a variable the project loaded from .env, however often .env changed since", () => {
    fs.writeFileSync(envFile(), `${VARIABLE}="${URL}"\n`);
    startWith(URL);
    expectOk(
      setConnectionUrl("erp", "postgres://reader@db.example:5432/erp2"),
      "setConnectionUrl",
    );
    expectOk(
      setConnectionUrl("erp", "postgres://reader@db.example:5432/erp3"),
      "setConnectionUrl",
    );
    expect(projectFile(app.root, ".env")).to.equal(
      `${VARIABLE}="postgres://reader:secret@db.example:5432/erp3"\n`,
    );
  });
});
