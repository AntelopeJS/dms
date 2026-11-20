import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readTimings, timed, TIMINGS_FILE } from "./timing.mjs";

/**
 * @param {import("node:test").TestContext} t The test
 * @returns {{ evidence: string }} A run whose evidence folder is removed when the test ends
 */
function scratchRun(t) {
  const evidence = mkdtempSync(join(tmpdir(), "dms-e2e-timing-test-"));
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  return { evidence };
}

/**
 * @param {string} phase The phase
 * @param {number} ms Its duration
 * @param {string} second The second of the minute it started in
 * @returns {import("./timing.mjs").TimingEntry} The entry
 */
function entry(phase, ms, second) {
  return {
    phase,
    ms,
    startedAt: `2026-11-07T10:00:${second}.000Z`,
    ok: true,
  };
}

await test("timed records the phase and returns what the action returned", async (t) => {
  const run = scratchRun(t);
  const value = await timed(run, "mail", () => 7, { step: "01-open" });
  const [recorded] = readTimings(run.evidence);
  assert.equal(value, 7);
  assert.equal(recorded.phase, "mail");
  assert.equal(recorded.ok, true);
  assert.equal(recorded.step, "01-open");
  assert.equal(Number.isInteger(recorded.ms), true);
});

await test("timed records a failing action with ok false and rethrows its error", async (t) => {
  const run = scratchRun(t);
  await assert.rejects(
    timed(run, "project-build", () => Promise.reject(new Error("boom"))),
    /boom/,
  );
  const [recorded] = readTimings(run.evidence);
  assert.equal(recorded.phase, "project-build");
  assert.equal(recorded.ok, false);
});

await test("timed records a synchronous throw too", async (t) => {
  const run = scratchRun(t);
  await assert.rejects(
    timed(run, "layout", () => {
      throw new Error("no space");
    }),
    /no space/,
  );
  assert.equal(readTimings(run.evidence)[0].ok, false);
});

await test("entries appended one after another are all read back, none replaced", async (t) => {
  const run = scratchRun(t);
  await timed(run, "up", () => undefined);
  await timed(run, "journey", () => undefined, { feature: "a", journey: "b" });
  assert.deepEqual(
    readTimings(run.evidence).map((recorded) => recorded.phase),
    ["up", "journey"],
  );
});

await test("a run without timings reads as none", (t) => {
  assert.deepEqual(readTimings(scratchRun(t).evidence), []);
});

await test("lines that are no entry are skipped and the others are kept", (t) => {
  const run = scratchRun(t);
  writeFileSync(
    join(run.evidence, TIMINGS_FILE),
    [
      JSON.stringify(entry("up", 10, "00")),
      '{"phase":"half',
      "",
      JSON.stringify({ phase: "up", ms: "slow" }),
      JSON.stringify(entry("mail", 5, "01")),
    ].join("\n"),
  );
  assert.deepEqual(
    readTimings(run.evidence).map((recorded) => recorded.phase),
    ["up", "mail"],
  );
});
