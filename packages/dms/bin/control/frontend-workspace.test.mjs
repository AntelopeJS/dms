import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PREPARED_WORKSPACE_REFUSED,
  setUpFrontendWorkspace,
} from "./frontend-workspace.mjs";
import { write } from "./helpers/repo.mjs";
import { treeOf } from "./helpers/tree.mjs";
import { ExitError, runToEnd } from "./processes.mjs";

const PRELOAD = new URL("prepared-workspace.mjs", import.meta.url).href;
const OWN_SETUP =
  "async () => ({ workspaceDir: 'set up again', layers: ['copied'] })";

/**
 * A dms-frontend whose CLI runs its workspace step on the folder it is
 * given and prints what the step returned, as `ajs dms build` reads it,
 * through the module's exports when it runs. Its step is a plain export, or
 * the accessor TypeScript emits for a re-export.
 *
 * @param {import("node:test").TestContext} t The test
 * @param {"export" | "re-export"} stepExport How the step is exported
 */
function frontendPackage(t, stepExport) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-frontend-workspace-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const frontend = join(dir, "dms-frontend");
  write(join(frontend, "package.json"), '{"version":"0.10.0"}');
  write(
    join(frontend, "dist", "commands", "workspace-task.js"),
    stepExport === "export"
      ? `exports.setUpWorkspace = ${OWN_SETUP};\n`
      : `Object.defineProperty(exports, "setUpWorkspace", { enumerable: true, get: () => ${OWN_SETUP} });\n`,
  );
  write(
    join(frontend, "dist", "index.js"),
    `require("./commands/workspace-task.js").setUpWorkspace({ workspaceDir: process.argv[2] }).then((result) => process.stdout.write(JSON.stringify(result)));\n`,
  );
  write(
    join(frontend, "dist", "env-file.js"),
    "exports.loadProjectEnv = () => {};\n",
  );
  write(
    join(frontend, "dist", "workspace-setup.js"),
    `exports.setupWorkspace = async (options) => require("node:fs").mkdirSync(options.workspaceDir, { recursive: true });\n`,
  );
  const workspace = join(dir, "project", ".dms-frontend");
  const logs = join(dir, "logs");
  mkdirSync(logs);
  /**
   * Runs the build as `up` does, and reads what it printed.
   *
   * @param {string} folder The workspace it builds in
   */
  const build = async (folder) => {
    const run = runToEnd({
      name: "frontend-build",
      program: process.execPath,
      args: ["--import", PRELOAD, join(frontend, "dist", "index.js"), folder],
      cwd: dir,
      env: process.env,
      logs,
    });
    const failure = await run.then(
      () => null,
      (/** @type {unknown} */ error) => error,
    );
    const output = treeOf(logs)?.["frontend-build.log"] ?? "";
    rmSync(join(logs, "frontend-build.log"));
    return { failure, output };
  };
  return { frontend, workspace, build };
}

/**
 * @param {unknown} failure
 * @returns {boolean}
 */
function refused(failure) {
  return (
    failure instanceof ExitError &&
    failure.exitCode === PREPARED_WORKSPACE_REFUSED
  );
}

await test("the build's preload makes it read the prepared workspace, and ends it with its own code when it cannot", async (t) => {
  const plain = frontendPackage(t, "export");
  write(join(plain.workspace, ".deps-hash"), "a\n");
  const prepared = await plain.build(plain.workspace);
  assert.equal(prepared.failure, null, prepared.output);
  assert.deepEqual(
    JSON.parse(prepared.output),
    { workspaceDir: plain.workspace, layers: [] },
    "a preload that leaves the step alone builds sources copied after the key was read",
  );
  const unprepared = await plain.build(join(plain.workspace, "..", "other"));
  assert.ok(
    refused(unprepared.failure),
    "a workspace that was not prepared fails the build as a broken build would",
  );
  const reExported = frontendPackage(t, "re-export");
  write(join(reExported.workspace, ".deps-hash"), "a\n");
  const accessor = await reExported.build(reExported.workspace);
  assert.ok(
    refused(accessor.failure),
    "a step it cannot replace fails the build as a broken build would",
  );
  assert.match(accessor.output, /cannot be replaced/u);
});

await test("a dms-frontend whose workspace step cannot be replaced fails the setup, before it sets anything up", async (t) => {
  const plain = frontendPackage(t, "export");
  await setUpFrontendWorkspace(plain.frontend, plain.workspace, "docs", false);
  assert.ok(existsSync(plain.workspace));
  const reExported = frontendPackage(t, "re-export");
  await assert.rejects(
    setUpFrontendWorkspace(
      reExported.frontend,
      reExported.workspace,
      "docs",
      false,
    ),
    /cannot be replaced/u,
  );
  assert.equal(
    existsSync(reExported.workspace),
    false,
    "a setup check that only reads the step lets up key a build it cannot run",
  );
});
