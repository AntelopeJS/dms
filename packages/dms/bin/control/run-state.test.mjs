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

await test("a run saved by an earlier release drops the browser folder it held in `browser`", (t) => {
  const dir = savedRun(t, { browser: "/runs/old/browser" });
  const state = loadRun(dir);
  assert.equal("browser" in state, false);
});

await test("a run saved by an earlier release keeps its server record once the browser started", (t) => {
  const dir = savedRun(t, { browser: SERVER });
  assert.deepEqual(loadRun(dir).browser, SERVER);
});

await test("a run without a browser reads back without one", (t) => {
  const dir = savedRun(t, {});
  assert.equal("browser" in loadRun(dir), false);
});

await test("saving a loaded run again keeps its server record", (t) => {
  const dir = savedRun(t, { browser: SERVER });
  const state = loadRun(dir);
  saveRun(state);
  assert.deepEqual(loadRun(dir), state);
});

await test("a run.json that holds no object reads back as it is", (t) => {
  for (const text of ["null", "[]", "5", '"s"', "{}"]) {
    const dir = mkdtempSync(join(tmpdir(), "dms-control-run-state-test-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, "run.json"), text);
    assert.deepEqual(loadRun(dir), JSON.parse(text));
  }
});

await test("a new run's folders hold no browser folder, and loading a fresh run has no server", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "dms-control-run-state-test-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, "run");
  const paths = createRunFolders(dir);
  assert.equal("browser" in paths, false);
  saveRun({ ...paths, id: "x" });
  assert.equal("browser" in loadRun(dir), false);
});
