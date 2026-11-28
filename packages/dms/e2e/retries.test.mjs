import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decode, isNumber, objectOf } from "./json.mjs";

const PLAYWRIGHT = fileURLToPath(import.meta.resolve("@playwright/test"));
const CLI = join(dirname(PLAYWRIGHT), "cli.js");
const KIT = fileURLToPath(import.meta.resolve("./index.mjs"));

/**
 * Runs, through the kit's config with its global setup left out, a suite of
 * one test that fails its first attempt and passes the next.
 *
 * @param {import("node:test").TestContext} t The test, which removes the suite
 * @param {string} event The `GITHUB_EVENT_NAME` of the run
 * @returns {{ status: number | null, stats: { flaky: number, unexpected: number }, output: string }} The exit status, the JSON report's stats and the report
 */
function runFlakySuite(t, event) {
  const dir = mkdtempSync(join(tmpdir(), "dms-e2e-retries-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(
    join(dir, "playwright.config.mjs"),
    `import { defineConfig } from ${JSON.stringify(PLAYWRIGHT)};
import { e2eConfig } from ${JSON.stringify(KIT)};
export default defineConfig(e2eConfig(), {
  globalSetup: [],
  workers: 1,
  reporter: [["json"]],
});
`,
  );
  writeFileSync(
    join(dir, "flaky.spec.ts"),
    `import { test } from ${JSON.stringify(PLAYWRIGHT)};
test("fails its first attempt", ({}, testInfo) => {
  if (testInfo.retry === 0) throw new Error("first attempt");
});
`,
  );
  const result = spawnSync(
    process.execPath,
    [CLI, "test", "-c", "playwright.config.mjs"],
    {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_NAME: event },
    },
  );
  const { stats } = decode(
    objectOf({ stats: objectOf({ flaky: isNumber, unexpected: isNumber }) }),
    JSON.parse(result.stdout),
    "the JSON report",
    "a report with its stats",
  );
  return {
    status: result.status,
    stats,
    output: `${result.stdout}${result.stderr}`,
  };
}

await test("a merge-queue run retries a failed journey once and reports its pass on retry as flaky, not failed (catches a kit with no retry in the queue, or one that hides the first failure)", (t) => {
  const { status, stats, output } = runFlakySuite(t, "merge_group");
  assert.equal(status, 0, output);
  assert.equal(stats.flaky, 1, output);
  assert.equal(stats.unexpected, 0, output);
});

await test("a pull request run never retries, so a journey that fails once fails the run (catches a retry outside the merge queue)", (t) => {
  const { status, stats, output } = runFlakySuite(t, "pull_request");
  assert.equal(status, 1, output);
  assert.equal(stats.unexpected, 1, output);
  assert.equal(stats.flaky, 0, output);
});
