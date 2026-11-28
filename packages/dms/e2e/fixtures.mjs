import { existsSync } from "node:fs";
import { join } from "node:path";
import { test as base, expect } from "@playwright/test";
import { currentRun } from "./global-setup.mjs";
import { judgeJourney, openJourney, timedJourney } from "./journey-run.mjs";
import { saveRun } from "./run-state.mjs";
import { featureOf, journeyOf } from "./test-journey.mjs";
import { loadSuiteConfig } from "./journeys-config.mjs";

/**
 * @typedef {import("./suite.mjs").Suite} Suite
 * @typedef {import("./test-journey.mjs").DmsOptions} DmsOptions How the `dms` fixture prepares a test
 * @typedef {{ dmsSuite: Suite, run: import("./run-state.mjs").RunState, journeysConfig: import("./journeys-config.mjs").SuiteConfig }} DmsWorkerFixtures What a worker shares: the suite its config declared, the run its global setup started for it, and the journeys config of the suite
 * @typedef {{ dmsOptions: DmsOptions, dms: import("./journey.mjs").JourneyContext, adminPage: import("@playwright/test").Page }} DmsTestFixtures What one test gets: its options, the journey context it drives the run through, and a page the administrator signed in on
 * @typedef {import("@playwright/test").PlaywrightTestArgs & import("@playwright/test").PlaywrightTestOptions} PlaywrightTestFixtures The fixtures Playwright gives a test
 * @typedef {import("@playwright/test").PlaywrightWorkerArgs & import("@playwright/test").PlaywrightWorkerOptions} PlaywrightWorkerFixtures The fixtures Playwright gives a worker
 */

const STEP_EVIDENCE = [
  ["screenshot.png", "image/png"],
  ["aria.yml", "text/yaml"],
];

/** @type {Suite} */
const UNDECLARED_SUITE = {
  config: undefined,
  frontend: "build",
};

/**
 * Replays a judged test into the Playwright report: a step per recorded
 * step, in which a `fail` check is a soft failure with its detail, a
 * `fixed` check a soft failure asking to remove it from `knownFailures`,
 * and a `known` check a "known failure" annotation. A step with a failing
 * check attaches its screenshot and ARIA snapshot. A failed test attaches
 * the serving backend's log and names its evidence folder. The judged error
 * is thrown last.
 *
 * @param {import("./types.mjs").FeatureResult} result The judged test
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {import("@playwright/test").TestInfo} testInfo The test
 * @returns {Promise<void>}
 */
async function report(result, state, testInfo) {
  for (const step of result.steps) {
    await base.step(step.name, async () => {
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
  if (result.status === "FAIL" || testInfo.status !== testInfo.expectedStatus) {
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

/** @type {import("@playwright/test").Fixtures<DmsTestFixtures, DmsWorkerFixtures, PlaywrightTestFixtures, PlaywrightWorkerFixtures>} */
const FIXTURES = {
  dmsSuite: [UNDECLARED_SUITE, { option: true, scope: "worker" }],
  run: [
    async ({ dmsSuite }, use, workerInfo) => {
      await use(currentRun(dmsSuite, workerInfo.parallelIndex));
    },
    { scope: "worker" },
  ],
  journeysConfig: [
    async ({ dmsSuite }, use) => {
      await use(await loadSuiteConfig(process.cwd(), dmsSuite.config));
    },
    { scope: "worker" },
  ],
  dmsOptions: [{}, { option: true }],
  baseURL: async ({ run }, use) => {
    await use(run.webUrl);
  },
  dms: async ({ run, journeysConfig, browser, dmsOptions }, use, testInfo) => {
    const journey = journeyOf(testInfo, dmsOptions);
    const feature = featureOf(testInfo);
    const result = await timedJourney(
      run,
      { feature, journey: journey.id },
      async () => {
        const context = await openJourney(
          run,
          feature,
          journey,
          journeysConfig,
          browser,
        );
        if (!context.ended) await use(context);
        return judgeJourney(context, journey);
      },
    );
    saveRun(run);
    await report(result, run, testInfo);
  },
  adminPage: async ({ dms }, use) => {
    const tab = await dms.tab("admin");
    await tab.signIn("admin");
    await use(tab.page);
  },
};

/**
 * Playwright's `test` with the fixtures of a DMS run. `run` is the run the
 * global setup started, which `baseURL` serves, so `page.goto("/settings")`
 * opens the dashboard. `dms` prepares the run for one test as a journey's
 * run does (by default a fresh database with a backend of its own and an
 * onboarded administrator; `test.use({ dmsOptions })` changes it), records
 * its evidence under `<run>/evidence/<feature>/<test>/`, and after the test
 * closes its tabs, judges its `verify` steps, and replays them into the
 * report with their failing evidence. `adminPage` is a tab of `dms` the
 * administrator signed in on. A test whose preparation fails does not run.
 *
 * @type {import("@playwright/test").TestType<PlaywrightTestFixtures & DmsTestFixtures, PlaywrightWorkerFixtures & DmsWorkerFixtures>}
 */
export const test = base.extend(FIXTURES);

export { expect };
