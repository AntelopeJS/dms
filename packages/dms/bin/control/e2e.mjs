import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { currentRun } from "./e2e-run.mjs";
import { assertForwardedRun } from "./backend.mjs";
import { runJourney } from "./journey.mjs";
import { loadJourneys } from "./journey-load.mjs";
import { saveRun } from "./run-state.mjs";
import { journeysFile, loadSkill, readFeatures } from "./verify/skill.mjs";

/**
 * @typedef {import("./journey.mjs").JourneyContext} Ctx What a journey drives the run through
 * @typedef {import("./tab.mjs").Tab} Tab A browser tab of a journey
 * @typedef {import("./journey.mjs").Check} Check A check a journey records
 * @typedef {import("./journey-load.mjs").Journey} Journey A journey a feature's module exports
 */

const MINUTE = 60_000;
const CI = Boolean(process.env.CI);
const STEP_EVIDENCE = [
  ["screenshot.png", "image/png"],
  ["aria.yml", "text/yaml"],
];

/**
 * The Playwright config of a journeys suite: one worker against the run its
 * global setup starts (parallelism comes from `--shard`), no retries, a test
 * timeout above dms-control's own waits, and the CI reporters. It is plain
 * Playwright config, so `defineConfig(e2eConfig(), overrides)` adjusts it.
 *
 * @returns {import("@playwright/test").PlaywrightTestConfig} The config
 */
export function e2eConfig() {
  return {
    testDir: ".",
    testMatch: /\.spec\.ts$/,
    outputDir: "test-results",
    fullyParallel: true,
    workers: 1,
    retries: 0,
    forbidOnly: CI,
    timeout: 15 * MINUTE,
    globalSetup: fileURLToPath(new URL("e2e-run.mjs", import.meta.url)),
    reporter: CI
      ? [
          ["list"],
          ["github"],
          ["html", { open: "never", outputFolder: "playwright-report" }],
          ["json", { outputFile: "playwright-report/results.json" }],
        ]
      : "list",
    use: { trace: "retain-on-failure" },
    projects: [{ name: "chromium" }],
  };
}

/**
 * Registers every journey of the checkout's verification skill, in the order
 * of its feature files and with those marked `last` after all others: one
 * test per journey, named by its id under its feature's name, with the
 * journey's `tag` and its title and entry point as annotations. A test drives its journey through `runJourney` in
 * Playwright's browser, on the run of the global setup, then replays the
 * judged result into the report.
 *
 * @returns {Promise<void>}
 * @throws When a feature has no journeys module, or two journeys share an id
 */
export async function registerJourneys() {
  const skill = await loadSkill(undefined, process.cwd());
  const features = await Promise.all(
    readFeatures(skill).map(async (feature) => ({
      name: feature.name,
      journeys: await loadJourneys(journeysFile(skill, feature.name)),
    })),
  );
  const ids = features.flatMap((feature) =>
    feature.journeys.map((journey) => journey.id),
  );
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (repeated.length > 0) {
    throw new Error(`Journey ids registered twice: ${repeated.join(", ")}`);
  }
  const entries = features.flatMap((feature) =>
    feature.journeys.map((journey) => ({ feature: feature.name, journey })),
  );
  for (const { feature, journey } of [
    ...entries.filter((entry) => !entry.journey.last),
    ...entries.filter((entry) => entry.journey.last),
  ]) {
    const annotation = [
      { type: "title", description: journey.title },
      { type: "entry point", description: journey.entryPoint },
    ];
    test.describe(feature, () => {
      test(
        journey.id,
        { tag: journey.tag, annotation },
        async ({ browser }, testInfo) => {
          const state = currentRun();
          assertForwardedRun(state);
          const result = await runJourney(
            state,
            feature,
            journey,
            skill,
            browser,
          );
          saveRun(state);
          await report(result, state, testInfo);
        },
      );
    });
  }
}

/**
 * Replays a judged journey into the Playwright report: a step per recorded
 * step, in which a `fail` check is a soft failure with its detail, a `fixed`
 * check a soft failure asking to remove it from `knownFailures`, and a
 * `known` check a "known failure" annotation. A step with a failing check
 * attaches its screenshot and ARIA snapshot. A failed journey attaches the
 * serving backend's log and names its evidence folder. Its error is thrown
 * last.
 *
 * @param {import("./verify/types.mjs").FeatureResult} result The judged journey
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {import("@playwright/test").TestInfo} testInfo The test
 * @returns {Promise<void>}
 */
async function report(result, state, testInfo) {
  for (const step of result.steps) {
    await test.step(step.name, async () => {
      for (const check of step.checks) {
        if (check.verdict === "fail") {
          expect.soft(check.pass, `${check.name}: ${check.detail}`).toBe(true);
        } else if (check.verdict === "fixed") {
          expect
            .soft(
              check.pass,
              `${check.name} passes: remove it from knownFailures (${check.finding})`,
            )
            .toBe(false);
        } else if (check.verdict === "known") {
          testInfo.annotations.push({
            type: "known failure",
            description: `${check.name}: ${check.finding}`,
          });
        }
      }
      const failing = step.checks.some(
        (check) => check.verdict === "fail" || check.verdict === "fixed",
      );
      if (!failing) return;
      for (const [file, contentType] of STEP_EVIDENCE) {
        const path = join(state.evidence, step.folder, file);
        if (existsSync(path)) {
          await testInfo.attach(`${step.name}/${file}`, { path, contentType });
        }
      }
    });
  }
  if (result.status === "FAIL") {
    testInfo.annotations.push({
      type: "evidence",
      description: join(state.evidence, result.folder),
    });
    const backend = state.processes.find((entry) => entry.name === "backend");
    if (backend && existsSync(backend.log)) {
      await testInfo.attach("backend.log", {
        path: backend.log,
        contentType: "text/plain",
      });
    }
  }
  if (result.error) throw new Error(result.error);
}
