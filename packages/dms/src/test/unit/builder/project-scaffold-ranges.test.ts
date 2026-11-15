import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import { setBuilderConfig } from "../../../config";
import { scaffoldLocalModule } from "../../../implementations/dms-builder/engine";
import { gitInit } from "./helpers/processes";

const CHECK_TIMEOUT = 180_000;
const TOOLING_CONFIGS = "@antelopejs/tooling-configs@0.7.2";
const RANGES_STEP = "dependency:ranges";
const OTHER_STEPS = [
  "typecheck",
  "lint",
  "format:check",
  "knip",
  "test",
  "size",
  "ratchet",
  "suppressions",
  "sync:check",
  "verify:types",
  "verify:lockfiles",
  "lockfile:singletons",
  "git:identity",
  "readme:version",
  "published:types",
];

let root: string;

/** The `dependency:ranges` step of the AntelopeJS checks, alone, on the repository at `directory`. */
function checkRanges(directory: string) {
  const run = spawnSync(
    `pnpm --silent --package=${TOOLING_CONFIGS} dlx antelopejs-checks --no-services`,
    {
      cwd: directory,
      shell: true,
      encoding: "utf8",
      env: { ...process.env, ANTELOPEJS_CHECKS_SKIP: OTHER_STEPS.join(",") },
    },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("the manifest of a scaffolded module", function () {
  this.timeout(CHECK_TIMEOUT);

  before(() => {
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
    spawnSync("git", ["add", "-A"], { cwd: root });
  });

  after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    setBuilderConfig({});
  });

  it(`passes the ${RANGES_STEP} check: every AntelopeJS range stops below the next minor`, () => {
    const checked = checkRanges(root);
    expect(checked.status, checked.output).to.equal(0);
    expect(checked.output).to.contain("Checks: 1 passed, 0 failed");
  });
});
