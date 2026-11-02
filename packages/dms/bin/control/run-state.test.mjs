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

const RUN = {
  root: "/run/root",
  home: "/run/home",
  logs: "/run/logs",
  mongo: "/run/mongo",
  evidence: "/run/evidence",
  cache: "/run/cache",
  id: "20261031T000000-abc123",
  createdAt: "2026-10-31T00:00:00.000Z",
  environment: "verify",
  playground: "/repo/playground",
  moduleRoot: "/repo",
  repo: "/repo",
  headSha: null,
  baseRef: "origin/main",
  skill: null,
  apiPort: 5010,
  webPort: 5011,
  smtpPort: 5012,
  mail: "/run/evidence/mail",
  apiUrl: "http://127.0.0.1:5010",
  webUrl: "http://127.0.0.1:5011",
  databasePrefix: "verify_x",
  database: "verify_x",
  mongoUrl: "",
  ownsMongo: true,
  secrets: { JWT: "s" },
  adminPassword: "pw",
  extraEnv: {},
  processes: [],
  accounts: { admin: { email: "a@example.com", password: "pw" } },
  tokens: {},
  ready: false,
};

/**
 * @param {import("node:test").TestContext} t The test
 * @param {Record<string, unknown>} fields What the saved file holds besides `dir` and the fields every run has
 * @returns {string} The run folder
 */
function savedRun(t, fields) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-run-state-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "run.json"),
    JSON.stringify({ ...RUN, dir, ...fields }),
  );
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

await test("a run.json that holds no run is refused", (t) => {
  for (const text of ["null", "[]", "5", '"s"', "{}"]) {
    const dir = mkdtempSync(join(tmpdir(), "dms-control-run-state-test-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(join(dir, "run.json"), text);
    assert.throws(
      () => loadRun(dir),
      /run\.json is malformed: expected a run state/,
    );
  }
});

await test("a run.json whose field has the wrong type is refused", (t) => {
  const dir = savedRun(t, { ready: "yes" });
  assert.throws(() => loadRun(dir), /malformed: expected a run state/);
  const processes = savedRun(t, { processes: [{ name: "api", pid: "7" }] });
  assert.throws(() => loadRun(processes), /malformed: expected a run state/);
});

await test("keys of a run.json that the schema does not name are written back", (t) => {
  const dir = savedRun(t, { addedByANewerRelease: 1 });
  saveRun(loadRun(dir));
  assert.equal(
    Object.getOwnPropertyDescriptor(loadRun(dir), "addedByANewerRelease")
      ?.value,
    1,
  );
});

await test("a new run's folders hold no browser folder, and loading a fresh run has no server", (t) => {
  const parent = mkdtempSync(join(tmpdir(), "dms-control-run-state-test-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, "run");
  const paths = createRunFolders(dir);
  assert.equal("browser" in paths, false);
  saveRun({ ...RUN, ...paths, id: "x" });
  assert.equal("browser" in loadRun(dir), false);
});
