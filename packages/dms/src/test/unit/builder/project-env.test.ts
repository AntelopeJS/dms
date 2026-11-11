import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import { ConfigureProject } from "../../../implementations/dms-builder";
import type { ProjectConfigStep } from "@antelopejs/interface-dms-builder";
import {
  configureProjectWithVariables,
  setProjectVariable,
} from "../../../implementations/dms-builder/engine/project-env";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { gitInit } from "./helpers/processes";
import { projectFile } from "./helpers/project-files";

const OP_TIMEOUT = 60_000;
const VARIABLE = "ERP_DATABASE_URL";
const URL = "postgres://reader:secret@db.example:5432/erp";

let app: Fixture;

function envFile(): string {
  return path.join(app.root, ".env");
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

/** The URL the builder's form takes goes to a `.env` git ignores, and nowhere else. */
describe("a project variable written by the builder", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    app = createFixture({ modules: ["erp-tables"] });
    gitInit(app.root);
    const wired = await ConfigureProject([
      {
        op: "ConfigureModule",
        id: "erp-tables",
        entry: { config: { mode: "external" }, env: { url: VARIABLE } },
      },
    ]);
    expectOk(wired, "ConfigureProject");
  });

  after(destroyFixture);

  it("refuses while git does not ignore .env", () => {
    expect(refusal(() => setProjectVariable(VARIABLE, URL))).to.match(
      /not ignored by git/,
    );
    expect(fs.existsSync(envFile())).to.equal(false);
  });

  it("refuses while git cannot say whether .env is ignored", () => {
    const repository = path.join(app.root, ".git");
    const aside = path.join(app.root, ".git-aside");
    fs.renameSync(repository, aside);
    fs.writeFileSync(repository, "not a gitdir\n");
    try {
      expect(refusal(() => setProjectVariable(VARIABLE, URL))).to.match(
        /git could not say whether \.env is ignored/,
      );
    } finally {
      fs.rmSync(repository);
      fs.renameSync(aside, repository);
    }
    expect(fs.existsSync(envFile())).to.equal(false);
  });

  it("refuses a variable envOverrides does not map", () => {
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    expect(refusal(() => setProjectVariable("OTHER_URL", URL))).to.match(
      /not in the configuration's envOverrides/,
    );
  });

  it("writes the variable once git ignores .env, and replaces it on the next write", () => {
    fs.writeFileSync(envFile(), "KEEP=1\n");
    setProjectVariable(VARIABLE, URL);
    setProjectVariable(VARIABLE, `${URL}?sslmode=require`);
    expect(projectFile(app.root, ".env")).to.equal(
      `KEEP=1\n${VARIABLE}="${URL}?sslmode=require"\n`,
    );
  });

  it("writes a value holding $ patterns as it is, when it replaces a line", () => {
    const value = "postgres://u:pa$$w$&rd$'@h/db";
    setProjectVariable(VARIABLE, value);
    expect(projectFile(app.root, ".env")).to.equal(
      `KEEP=1\n${VARIABLE}="${value}"\n`,
    );
  });

  it("refuses a value that would break out of its quotes", () => {
    expect(refusal(() => setProjectVariable(VARIABLE, 'x"\nOTHER=1'))).to.match(
      /quote or a line break/,
    );
  });
});

/** The form sends the URL with the batch that maps it, so a config never names a value that failed. */
describe("a batch sent with its variable's value", function () {
  this.timeout(OP_TIMEOUT);

  const steps: ProjectConfigStep[] = [
    {
      op: "ConfigureModule",
      id: "erp-tables",
      entry: { config: { mode: "external" }, env: { url: VARIABLE } },
    },
  ];

  function configText(): string {
    return projectFile(app.root, "antelope.config.ts");
  }

  beforeEach(() => {
    app = createFixture({ modules: ["erp-tables"] });
    gitInit(app.root);
  });

  after(destroyFixture);

  it("writes nothing when .env is refused", () => {
    const before = configText();
    const result = configureProjectWithVariables(steps, [
      {
        name: VARIABLE,
        value: URL,
      },
    ]);
    expect(JSON.stringify(result)).to.match(/not ignored by git/);
    expect(configText()).to.equal(before);
    expect(fs.existsSync(envFile())).to.equal(false);
  });

  it("writes .env, then the configuration that maps it and loads it", () => {
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    expectOk(
      configureProjectWithVariables(steps, [{ name: VARIABLE, value: URL }]),
      "ConfigureProject with its variable",
    );
    expect(projectFile(app.root, ".env")).to.equal(`${VARIABLE}="${URL}"\n`);
    expect(configText())
      .to.include(`${VARIABLE}: "modules.erp-tables.config.url"`)
      .and.to.include("process.loadEnvFile(projectEnvFile);");
  });

  it("writes every variable the batch maps, or none when one is refused", () => {
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    const before = configText();
    const refused = configureProjectWithVariables(steps, [
      { name: VARIABLE, value: URL },
      { name: "OTHER_DATABASE", value: "erp" },
    ]);
    expect(JSON.stringify(refused)).to.match(
      /not in the configuration's envOverrides/,
    );
    expect(configText()).to.equal(before);
    expect(fs.existsSync(envFile())).to.equal(false);
    const both: ProjectConfigStep[] = [
      {
        op: "ConfigureModule",
        id: "erp-tables",
        entry: {
          config: { mode: "external" },
          env: { url: VARIABLE, database: "ERP_DATABASE" },
        },
      },
    ];
    expectOk(
      configureProjectWithVariables(both, [
        { name: VARIABLE, value: URL },
        { name: "ERP_DATABASE", value: "erp" },
      ]),
      "ConfigureProject with its two variables",
    );
    expect(projectFile(app.root, ".env")).to.equal(
      `${VARIABLE}="${URL}"\nERP_DATABASE="erp"\n`,
    );
  });

  it("leaves a configuration that loads .env already as it is, apart from the batch", () => {
    const configPath = path.join(app.root, "antelope.config.ts");
    fs.writeFileSync(configPath, `import "dotenv/config";\n${configText()}`);
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    expectOk(
      configureProjectWithVariables(steps, [{ name: VARIABLE, value: URL }]),
      "ConfigureProject with its variable",
    );
    expect(configText()).to.not.include("loadEnvFile");
  });
});
