import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import { scaffoldLocalModule } from "../../../implementations/dms-builder/engine";
import { gitInit, runScript } from "./helpers/processes";

const CHECK_TIMEOUT = 180_000;
const RANGES_STEP = "dependency:ranges";
const SKIP_VARIABLE = "ANTELOPEJS_CHECKS_SKIP";
const OTHER_STEPS = [
  "typecheck",
  "lint",
  "format:check",
  "knip",
  "test",
  "size",
  "suppressions",
  "sync:check",
  "verify:types",
  "lockfile:singletons",
  "git:identity",
  "readme:version",
  "published:types",
];
const NODE_BIN = path.dirname(process.execPath);
/** The bins this package installs, `antelopejs-checks` among them. */
const PACKAGE_BIN = path.resolve(__dirname, "../../../../node_modules/.bin");

let root: string;
let skipped: string | undefined;

/** The `dependency:ranges` step of the AntelopeJS checks, alone, on the repository at `directory`. */
function checkRanges(directory: string) {
  return runScript("antelopejs-checks --no-services", directory, PACKAGE_BIN);
}

describe("the manifest of a scaffolded module", function () {
  this.timeout(CHECK_TIMEOUT);

  before(() => {
    skipped = process.env[SKIP_VARIABLE];
    process.env[SKIP_VARIABLE] = OTHER_STEPS.join(",");
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dms-builder-ranges-"));
    setBuilderConfig({ projectRoot: root });
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "project", private: true }),
    );
    const scaffold = scaffoldLocalModule("m", "modules/m");
    for (const [file, text] of scaffold.files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    gitInit(root);
    const staged = runScript("git add -A", root, NODE_BIN);
    expect(staged.status, staged.output).to.equal(0);
  });

  after(() => {
    if (skipped === undefined) {
      delete process.env[SKIP_VARIABLE];
    } else {
      process.env[SKIP_VARIABLE] = skipped;
    }
    fs.rmSync(root, { recursive: true, force: true });
    setBuilderConfig({});
  });

  it(`passes the ${RANGES_STEP} check: every AntelopeJS range stops below the next minor`, () => {
    const checked = checkRanges(root);
    expect(checked.status, checked.output).to.equal(0);
    expect(checked.output).to.contain("Checks: 1 passed, 0 failed");
  });
});
