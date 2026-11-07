import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  formatTimings,
  markdownTimings,
  readTimings,
  summarize,
  timed,
  TIMINGS_FILE,
} from "./timing.mjs";

/**
 * @param {import("node:test").TestContext} t The test
 * @returns {{ evidence: string }} A run whose evidence folder is removed when the test ends
 */
function scratchRun(t) {
  const evidence = mkdtempSync(join(tmpdir(), "dms-control-timing-test-"));
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  return { evidence };
}

/**
 * @param {string} phase The phase
 * @param {number} ms Its duration
 * @param {string} second The second of the minute it started in
 * @param {import("./timing.mjs").TimingDetail} [detail] What it names
 * @returns {import("./timing.mjs").TimingEntry} The entry
 */
function entry(phase, ms, second, detail = {}) {
  return {
    phase,
    ms,
    startedAt: `2026-11-07T10:00:${second}.000Z`,
    ok: true,
    ...detail,
  };
}

await test("each journey is its own row, so two journeys of a feature are not merged", () => {
  const { rows } = summarize([
    entry("journey", 4000, "10", { feature: "auth", journey: "login" }),
    entry("journey", 9000, "20", { feature: "auth", journey: "invite" }),
  ]);
  assert.deepEqual(
    rows.map((row) => [row.name, row.count, row.totalMs]),
    [
      ["journey auth/login", 1, 4000],
      ["journey auth/invite", 1, 9000],
    ],
  );
});

await test("the total sums the top-level phases and not the phases they contain", () => {
  const { totalMs } = summarize([
    entry("prepare", 1000, "00"),
    entry("up", 5000, "01"),
    entry("mongod", 2000, "02"),
    entry("journey", 3000, "10", { feature: "auth", journey: "login" }),
    entry("journey-run", 2500, "11", { feature: "auth", journey: "login" }),
    entry("backend-stop", 700, "12"),
    entry("formal", 400, "30", { check: "formal-add" }),
    entry("browser-command", 900, "40", { action: "snapshot" }),
  ]);
  assert.equal(totalMs, 1000 + 5000 + 3000 + 400);
});

await test("a phase run several times has its count, total, median and maximum", () => {
  const { rows } = summarize([
    entry("aria", 30, "01"),
    entry("aria", 10, "02"),
    entry("aria", 200, "03"),
  ]);
  assert.deepEqual(rows, [
    { name: "aria", count: 3, totalMs: 240, medianMs: 30, maxMs: 200 },
  ]);
});

await test("the median of an even count is the mean of the two middle durations", () => {
  const { rows } = summarize([
    entry("screenshot", 400, "01"),
    entry("screenshot", 100, "02"),
    entry("screenshot", 300, "03"),
    entry("screenshot", 200, "04"),
  ]);
  assert.equal(rows[0].medianMs, 250);
});

await test("rows follow when each phase first started, not the order its entries were written", () => {
  const { rows } = summarize([
    entry("mongod", 100, "02"),
    entry("up", 900, "01"),
    entry("prepare", 5000, "00"),
  ]);
  assert.deepEqual(
    rows.map((row) => row.name),
    ["prepare", "up", "mongod"],
  );
});

await test("an empty run has no rows and a zero total", () => {
  assert.deepEqual(summarize([]), { rows: [], totalMs: 0 });
});

await test("the plain table aligns its columns and ends with the total line", () => {
  const summary = summarize([
    entry("up", 123_400, "00"),
    entry("aria", 20, "10"),
    entry("aria", 80, "11"),
  ]);
  assert.equal(
    formatTimings(summary),
    [
      "phase  count  total s  median ms  max ms",
      "up         1    123.4     123400  123400",
      "aria       2      0.1         50      80",
      "total           123.4",
    ].join("\n"),
  );
});

await test("the Markdown table has the same cells as the plain one", () => {
  const summary = summarize([entry("up", 2000, "00")]);
  assert.deepEqual(markdownTimings(summary), [
    "| phase | count | total s | median ms | max ms |",
    "|---|---|---|---|---|",
    "| up | 1 | 2.0 | 2000 | 2000 |",
    "| total |  | 2.0 |  |  |",
  ]);
});

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
