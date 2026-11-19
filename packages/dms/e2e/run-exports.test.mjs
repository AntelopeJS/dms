import assert from "node:assert/strict";
import test from "node:test";
import { newRun } from "./helpers/fake-run.mjs";
import { freePort } from "./processes.mjs";
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

await test("runJourney of the entry runs an HTTP journey on a fresh database and judges it; a journey that asks for a tab fails with a message naming ctx.tab (catches a wrapper that skips the preparation, drops the judging or lets a tab reach a browser)", async (t) => {
  const run = await newRun(t);
  run.smtpPort = await freePort();
  saveRun(run);
  const base = { title: "t", entryPoint: "e", onboard: false };

  const http = await entry.runJourney(run, "feat", {
    ...base,
    id: "http",
    async run(ctx) {
      const answer = await ctx.api("informations", {
        method: "GET",
        path: "/api/onboarding/informations",
        as: "anon",
      });
      ctx.record(
        ctx.step("answer"),
        [
          ctx.holds(
            "the backend answers 200",
            answer.status === 200,
            answer.status,
          ),
        ],
        {},
      );
    },
  });
  assert.equal(http.error, null);
  assert.equal(http.status, "PASS");
  assert.equal(http.database, `${run.databasePrefix}_j001`);
  assert.ok(
    http.steps.some((step) =>
      step.checks.some(
        (check) =>
          check.name === "the backend answers 200" && check.verdict === "pass",
      ),
    ),
  );

  const tab = await entry.runJourney(run, "feat", {
    ...base,
    id: "tab",
    async run(ctx) {
      await ctx.tab();
    },
  });
  assert.equal(tab.status, "FAIL");
  assert.match(tab.error ?? "", /ctx\.tab\(\) needs a browser/);
});
