import assert from "node:assert/strict";
import test from "node:test";
import { runJourney, startRun } from "@antelopejs/dms/e2e/run";
import { commandLineJourneys as databaseConnect } from "../journeys/database-connect.mjs";
import { commandLineJourneys as mcpServer } from "../journeys/mcp-server.mjs";

/**
 * The journeys that open no tab, on a run of the playground the e2e suite
 * prepared. The database-connect journeys change the run's playground, so
 * they run last.
 */
const FEATURES = [
  { feature: "mcp-server", journeys: mcpServer },
  { feature: "database-connect", journeys: databaseConnect },
];

/**
 * @param {import("@antelopejs/dms/e2e/run").FeatureResult} result A judged journey
 * @returns {string} Its error and the checks that failed
 */
function failures(result) {
  const failed = result.steps.flatMap((step) =>
    step.checks
      .filter((check) => check.verdict === "fail" || check.verdict === "fixed")
      .map((check) => `${step.name}: ${check.name} (${check.detail})`),
  );
  return [result.error, ...failed].filter(Boolean).join("\n");
}

await test("the journeys that open no tab, on one run", async (t) => {
  const { run, stop } = await startRun({ prepare: false });
  t.after(stop);

  for (const { feature, journeys } of FEATURES) {
    for (const journey of journeys) {
      await t.test(`${feature} › ${journey.id}`, async () => {
        const result = await runJourney(run, feature, journey);

        assert.equal(result.status, "PASS", failures(result));
      });
    }
  }
});
