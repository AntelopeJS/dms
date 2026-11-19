import { fileURLToPath } from "node:url";
import { test } from "./fixtures.mjs";
import { loadJourneys } from "./journey-load.mjs";
import { declareSuite, declaredSuite, suiteJourneys } from "./suite.mjs";
import { journeysFile, loadSkill, readFeatures } from "./verify/skill.mjs";

export * from "./fixtures.mjs";

/**
 * @typedef {import("./journey.mjs").JourneyContext} Ctx What a journey drives the run through
 * @typedef {import("./tab.mjs").Tab} Tab A browser tab of a journey
 * @typedef {import("./journey.mjs").Check} Check A check a journey records
 * @typedef {import("./journey-load.mjs").Journey} Journey A journey a feature's module exports
 * @typedef {import("./suite.mjs").SuiteOptions} SuiteOptions What a journeys suite runs
 */

const MINUTE = 60_000;
const CI = Boolean(process.env.CI);

/**
 * The Playwright config of a suite: one worker against the run its global
 * setup starts (parallelism comes from `--shard`), no retries, a test
 * timeout above the kit's own waits, and the CI reporters. It is plain
 * Playwright config, so `defineConfig(e2eConfig(), overrides)` adjusts it.
 * `skill` names the verify skill of a repository that has several.
 * `frontend: "dev"` serves the run's dashboard with `ajs dms dev` and
 * registers only the journeys that set `frontend: "dev"`, which every other
 * suite leaves out; its test output and report folders end in `-dev`. The
 * config hands the suite to the fixtures as the worker option `dmsSuite`.
 *
 * @param {SuiteOptions} [options] The suite
 * @returns {import("@playwright/test").PlaywrightTestConfig} The config
 */
export function e2eConfig(options = {}) {
  const suite = declareSuite(options);
  const suffix = options.frontend === "dev" ? "-dev" : "";
  return {
    testDir: ".",
    testMatch: /\.spec\.ts$/,
    outputDir: `test-results${suffix}`,
    fullyParallel: true,
    workers: 1,
    retries: 0,
    forbidOnly: CI,
    timeout: 15 * MINUTE,
    globalSetup: fileURLToPath(new URL("global-setup.mjs", import.meta.url)),
    reporter: CI
      ? [
          ["list"],
          ["github"],
          [
            "html",
            { open: "never", outputFolder: `playwright-report${suffix}` },
          ],
          ["json", { outputFile: `playwright-report${suffix}/results.json` }],
        ]
      : "list",
    use: { trace: "retain-on-failure", dmsSuite: suite },
    projects: [{ name: "chromium" }],
  };
}

/**
 * Registers the journeys of the suite its config declared: those of the
 * config's verify skill that its `frontend` serves, in the order of the
 * skill's feature files and with those marked `last` after all others. One
 * test per journey, named by its id under its feature's name, with the
 * journey's `tag` and its title and entry point as annotations. Each test
 * drives its journey through the `dms` fixture, prepared with the
 * journey's `database`, `onboard`, `backend` and `standby` and judged
 * against its `knownFailures`.
 *
 * @returns {Promise<void>}
 * @throws When a feature has no journeys module, or two journeys share an id
 */
export async function registerJourneys() {
  const suite = declaredSuite();
  const skill = await loadSkill(suite.skill, process.cwd());
  const features = await Promise.all(
    readFeatures(skill).map(async (feature) => ({
      name: feature.name,
      journeys: await loadJourneys(journeysFile(skill, feature.name)),
    })),
  );
  for (const { feature, journey } of suiteJourneys(features, suite.frontend)) {
    const annotation = [
      { type: "title", description: journey.title },
      { type: "entry point", description: journey.entryPoint },
    ];
    test.describe(feature, () => {
      test.use({
        dmsOptions: {
          database: journey.database,
          onboard: journey.onboard,
          backend: journey.backend,
          standby: journey.standby,
          knownFailures: journey.knownFailures,
        },
      });
      test(journey.id, { tag: journey.tag, annotation }, ({ dms }) =>
        dms.drive(journey.run),
      );
    });
  }
}
