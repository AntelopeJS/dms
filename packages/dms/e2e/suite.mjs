import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkoutOf } from "./git.mjs";
import { isRecord, isString } from "./json.mjs";

/**
 * @typedef {import("./journey-load.mjs").Journey} Journey
 * @typedef {{ skill?: string, frontend?: "dev" }} SuiteOptions What a journeys suite runs: `skill` is the verify skill folder, relative to the repository root, for a repository with several; `frontend: "dev"` serves the dashboard with `ajs dms dev` and runs only the journeys that ask for it
 * @typedef {{ skill: string | undefined, frontend: "build" | "dev" }} Suite The suite a config declared, its skill folder absolute
 */

const SUITE = "DMS_E2E_SUITE";

/**
 * @param {unknown} value A suite option
 * @returns {value is SuiteOptions} True for the options `e2eConfig` takes
 */
function isSuiteOptions(value) {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => key === "skill" || key === "frontend") &&
    (value.skill === undefined ||
      (isString(value.skill) && value.skill !== "")) &&
    (value.frontend === undefined || value.frontend === "dev")
  );
}

/**
 * Records the suite a config declares, for its global setup and for the
 * workers that load its spec, which inherit the environment of the process
 * that loaded the config.
 *
 * @param {unknown} options The options of `e2eConfig`
 * @returns {Suite} The suite
 * @throws When an option is unknown, its value is not one the suite takes, or `skill` holds no `verify.config.ts`
 */
export function declareSuite(options) {
  if (!isSuiteOptions(options)) {
    throw new Error(
      `e2eConfig takes { skill?: <the verify skill folder>, frontend?: "dev" }, got ${JSON.stringify(options)}`,
    );
  }
  const root = checkoutOf(process.cwd()).root ?? process.cwd();
  /** @type {Suite} */
  const suite = {
    skill:
      options.skill === undefined ? undefined : resolve(root, options.skill),
    frontend: options.frontend ?? "build",
  };
  if (suite.skill && !existsSync(join(suite.skill, "verify.config.ts"))) {
    throw new Error(
      `e2eConfig's skill ${suite.skill} holds no verify.config.ts`,
    );
  }
  process.env[SUITE] = JSON.stringify(suite);
  return suite;
}

/**
 * @returns {Suite} The suite of the config that loaded this process
 * @throws When no `e2eConfig` ran in it
 */
export function declaredSuite() {
  const recorded = process.env[SUITE];
  if (!recorded) {
    throw new Error(
      `${SUITE} is not set: run the suite through a Playwright config built by e2eConfig()`,
    );
  }
  /** @type {unknown} */
  const suite = JSON.parse(recorded);
  if (!isSuite(suite)) throw new Error(`${SUITE} holds no suite: ${recorded}`);
  return suite;
}

/**
 * @param {unknown} value What the environment recorded
 * @returns {value is Suite} True for a suite `declareSuite` recorded
 */
function isSuite(value) {
  return (
    isRecord(value) &&
    (value.skill === undefined || isString(value.skill)) &&
    (value.frontend === "build" || value.frontend === "dev")
  );
}

/**
 * The journeys a suite runs: those of the `smoke` feature first, then the
 * others in the order of their features, and those marked `last` after all
 * others. A `frontend: "dev"` suite runs the journeys that ask for the
 * development dashboard, any other the rest.
 *
 * @param {{ name: string, journeys: Journey[] }[]} features The features and their journeys
 * @param {Suite["frontend"]} frontend How the suite's run serves its dashboard
 * @param {string} smoke The feature whose journeys run first, the verify config's `smoke`
 * @returns {{ feature: string, journey: Journey }[]} The journeys, each with its feature
 * @throws When two journeys share an id
 */
export function suiteJourneys(features, frontend, smoke) {
  const ids = features.flatMap((feature) =>
    feature.journeys.map((journey) => journey.id),
  );
  const repeated = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (repeated.length > 0) {
    throw new Error(`Journey ids registered twice: ${repeated.join(", ")}`);
  }
  const entries = [
    ...features.filter((feature) => feature.name === smoke),
    ...features.filter((feature) => feature.name !== smoke),
  ]
    .flatMap((feature) =>
      feature.journeys.map((journey) => ({ feature: feature.name, journey })),
    )
    .filter(
      (entry) => (entry.journey.frontend === "dev") === (frontend === "dev"),
    );
  return [
    ...entries.filter((entry) => !entry.journey.last),
    ...entries.filter((entry) => entry.journey.last),
  ];
}
