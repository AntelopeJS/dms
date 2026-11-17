import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { moduleRootOf } from "./module-root.mjs";

/**
 * @param {import("node:test").TestContext} t The test
 * @returns {string} A real scratch folder removed when the test ends
 */
function scratch(t) {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "dms-control-module-root-test-")),
  );
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * @param {string} folder The folder
 * @param {Record<string, unknown>} manifest Its `package.json`
 * @returns {string} The folder
 */
function writePackage(folder, manifest) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "package.json"), JSON.stringify(manifest));
  return folder;
}

const MODULE = {
  name: "@antelopejs/dms-x",
  version: "1.2.3",
  antelopeJs: { baseUrl: "dist" },
};
const PLAYGROUND = { name: "playground", antelopeJs: { baseUrl: "dist" } };

await test("the module of a playground in a verification skill is the repository's module, not the skill folder", (t) => {
  const repo = writePackage(scratch(t), MODULE);
  const skill = writePackage(join(repo, ".agents", "skills", "verify-dms-x"), {
    type: "module",
  });
  const playground = writePackage(join(skill, "playground"), PLAYGROUND);
  assert.equal(moduleRootOf(playground, repo), repo);
});

await test("the module of a playground inside the module is its parent", (t) => {
  const workspace = writePackage(scratch(t), {
    name: "workspace",
    antelopeJs: {},
  });
  const module = writePackage(join(workspace, "packages", "dms"), MODULE);
  const playground = writePackage(join(module, "playground"), PLAYGROUND);
  assert.equal(moduleRootOf(playground, workspace), module);
});

await test("a playground with no module above it in its checkout keeps its parent as the module, whatever sits above the checkout", (t) => {
  const outside = writePackage(scratch(t), MODULE);
  const checkout = join(outside, "checkout");
  const parent = join(checkout, "apps");
  const playground = writePackage(join(parent, "playground"), PLAYGROUND);
  assert.equal(moduleRootOf(playground, checkout), parent);
});
