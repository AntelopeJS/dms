import assert from "node:assert/strict";
import test from "node:test";
import { freshDatabase, restartBackend } from "./backend.mjs";
import { capturedMail } from "./mail.mjs";
import * as entry from "./run.mjs";
import { loadRun, saveRun } from "./run-state.mjs";

await test("the e2e/run entry hands a test the very functions the kit runs on (catches an export dropped or wrapped which leaves a ported test without the run state, database or mail helpers)", () => {
  assert.equal(entry.loadRun, loadRun);
  assert.equal(entry.saveRun, saveRun);
  assert.equal(entry.freshDatabase, freshDatabase);
  assert.equal(entry.restartBackend, restartBackend);
  assert.equal(entry.capturedMail, capturedMail);
});
