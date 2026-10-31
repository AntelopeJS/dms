import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRunFolders, loadRun, saveRun } from "./run-state.mjs";

const SERVER = {
  name: "browser",
  pid: 4242,
  command: "node serve",
  cwd: "/run",
  log: "/run/logs/browser.log",
  startedAt: "2026-10-31T00:00:00.000Z",
  port: 40123,
};

/**
 * @param {import("node:test").TestContext} t The test
 * @param {Record<string, unknown>} fields What the saved file holds besides `dir`
 * @returns {string} The run folder
 */
function savedRun(t, fields) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-run-state-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify({ dir, ...fields }));
  return dir;
}

await test("a run saved before the split keeps its folder when the browser never started", (t) => {
  const dir = savedRun(t, { browser: "/runs/old/browser" });
  const state = loadRun(dir);
  assert.equal(state.browserFolder, "/runs/old/browser");
  assert.equal(state.browser, undefined);
});

await test("a run saved before the split keeps its server record once the browser started", (t) => {
  const dir = savedRun(t, { browser: SERVER });
  const state = loadRun(dir);
  assert.deepEqual(state.browser, SERVER);
  assert.equal(state.browserFolder, join(dir, "browser"));
});

await test("a run saved before the split and stopped by down has the folder again, and no server", (t) => {
  const dir = savedRun(t, {});
  const state = loadRun(dir);
  assert.equal(state.browserFolder, join(dir, "browser"));
  assert.equal(state.browser, undefined);
});

await test("a run saved after the split reads back both fields, and saving it again keeps them", (t) => {
  const dir = savedRun(t, {
    browserFolder: "/runs/new/browser",
    browser: SERVER,
  });
  const state = loadRun(dir);
  assert.equal(state.browserFolder, "/runs/new/browser");
  assert.deepEqual(state.browser, SERVER);
  saveRun(state);
  assert.deepEqual(loadRun(dir), state);
});

await test("a new run's folders name the browser folder, and loading a fresh run has no server", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "dms-control-run-state-test-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, "run");
  const paths = createRunFolders(dir);
  assert.equal(paths.browserFolder, join(dir, "browser"));
  saveRun({ ...paths, id: "x" });
  const state = loadRun(dir);
  assert.equal(state.browserFolder, join(dir, "browser"));
  assert.equal(state.browser, undefined);
});
