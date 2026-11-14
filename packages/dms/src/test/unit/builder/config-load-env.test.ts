import fs from "node:fs";
import path from "node:path";
import { ConfigLoader } from "@antelopejs/core";
import { expect } from "chai";
import {
  ConfigureProject,
  ListEntryConnections,
} from "../../../implementations/dms-builder";
import { setProjectVariable } from "../../../implementations/dms-builder/engine";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";
import { gitInit } from "./helpers/processes";

const OP_TIMEOUT = 120_000;
const VARIABLE = "ERP_RESTART_URL";
const OTHER = "ERP_RESTART_OTHER";
const OLD_URL = "postgres://reader:old@db.example:5432/erp";
const NEW_URL = "postgres://reader:new@db.example:5432/erp";

type FileSystem = ConstructorParameters<typeof ConfigLoader>[0];

const NODE_FILE_SYSTEM: FileSystem = {
  readFile: (file) => fs.promises.readFile(file),
  readFileString: (file, encoding = "utf8") =>
    fs.promises.readFile(file, encoding),
  readdir: (directory) => fs.promises.readdir(directory),
  stat: (file) => fs.promises.stat(file),
  exists: (file) =>
    fs.promises.access(file).then(
      () => true,
      () => false,
    ),
  access: (file) => fs.promises.access(file),
  writeFile: (file, data) => fs.promises.writeFile(file, data),
  mkdir: (directory) => fs.promises.mkdir(directory).then(() => undefined),
  rm: (file) => fs.promises.rm(file),
  copyFile: (from, to) => fs.promises.copyFile(from, to),
  rename: (from, to) => fs.promises.rename(from, to),
};

let app: Fixture;

/** Loads the configuration as core does when the project starts, and again on each restart. */
async function coreLoad(): Promise<void> {
  await new ConfigLoader(NODE_FILE_SYSTEM).load(
    app.root,
    "default",
    path.join(app.root, "antelope.config.ts"),
  );
}

/** A value the builder writes to `.env` reaches the project once it restarts, whatever builder call ran meanwhile. */
describe("a .env value written before a restart", function () {
  this.timeout(OP_TIMEOUT);

  before(async () => {
    app = createFixture({ modules: ["erp-tables"] });
    gitInit(app.root);
    fs.writeFileSync(path.join(app.root, ".gitignore"), ".env\n");
    expectOk(
      await ConfigureProject([
        {
          op: "ConfigureModule",
          id: "erp-tables",
          entry: { config: { mode: "external" }, env: { url: VARIABLE } },
        },
      ]),
      "ConfigureProject",
    );
  });

  afterEach(() => {
    delete process.env[VARIABLE];
    delete process.env[OTHER];
  });

  after(destroyFixture);

  it("loads on the restart after a builder call loaded the configuration", async () => {
    fs.writeFileSync(path.join(app.root, ".env"), `${VARIABLE}="${OLD_URL}"\n`);
    await coreLoad();
    expect(process.env[VARIABLE]).to.equal(OLD_URL);
    setProjectVariable(VARIABLE, NEW_URL);
    expectOk(await ListEntryConnections("erp-tables"), "ListEntryConnections");
    await coreLoad();
    expect(process.env[VARIABLE]).to.equal(NEW_URL);
  });

  it("leaves a variable other code set as it was", async () => {
    fs.writeFileSync(path.join(app.root, ".env"), `${VARIABLE}="${OLD_URL}"\n`);
    process.env[OTHER] = "kept";
    await coreLoad();
    fs.writeFileSync(
      path.join(app.root, ".env"),
      `${VARIABLE}="${NEW_URL}"\n${OTHER}="from-env-file"\n`,
    );
    expectOk(await ListEntryConnections("erp-tables"), "ListEntryConnections");
    expect(process.env[OTHER]).to.equal("kept");
  });
});
