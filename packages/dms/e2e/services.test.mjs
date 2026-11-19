import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { newRun } from "./helpers/fake-run.mjs";
import { listenersOf, restartablePort } from "./processes.mjs";
import { readRun, saveRun } from "./run-state.mjs";

/**
 * A copy of this folder alone, as a package that ships the kit and no
 * `bin/` would hold it.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {string} The copy
 */
function kitWithoutBin(t) {
  const parent = mkdtempSync(join(tmpdir(), "dms-e2e-services-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const kit = join(parent, "dms", "e2e");
  cpSync(import.meta.dirname, kit, { recursive: true });
  return kit;
}

await test("a copy of the kit with no bin/ beside it starts a run's mail sink (catches a stack that runs its services through dms-control)", async (t) => {
  const kit = kitWithoutBin(t);
  const state = await newRun(t);
  state.smtpPort = await restartablePort();
  saveRun(state);
  const started = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `const { ensureMail } = await import(${JSON.stringify(pathToFileURL(join(kit, "stack.mjs")).href)});
const { loadRun } = await import(${JSON.stringify(pathToFileURL(join(kit, "run-state.mjs")).href)});
await ensureMail(loadRun(${JSON.stringify(state.dir)}));`,
    ],
    { encoding: "utf8" },
  );
  assert.equal(started.status, 0, started.stderr);
  const mail = readRun(state.dir).processes.find(
    (entry) => entry.name === "mail",
  );
  assert.deepEqual(listenersOf(state.smtpPort), [mail?.pid]);
});

await test("the service entry refuses a name it does not serve and names those it does (catches an entry that exits 0 on a typo, leaving the stack to wait on a port nothing listens on)", () => {
  const entry = spawnSync(
    process.execPath,
    [join(import.meta.dirname, "service.mjs"), "serve-mail", tmpdir()],
    { encoding: "utf8" },
  );
  assert.equal(entry.status, 1);
  assert.match(
    entry.stderr,
    /Unknown service serve-mail; expected one of mail, api, prepare-frontend/,
  );
});
