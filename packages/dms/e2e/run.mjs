import { runJourney as driveJourney } from "./journey-run.mjs";
import { startRuns } from "./start.mjs";

export { apiRequest, onboard } from "./session.mjs";
export { freshDatabase, restartBackend } from "./backend.mjs";
export { capturedMail } from "./mail.mjs";
export { loadRun, saveRun } from "./run-state.mjs";

/**
 * @typedef {import("./run-state.mjs").RunState} RunState A running DMS: its `apiUrl`, `webUrl`, `accounts`, `secrets` and `evidence` folder
 * @typedef {import("./start.mjs").RunOptions} RunOptions How a test starts a run
 * @typedef {{ run: RunState, stop: () => Promise<void> }} StartedRun A ready run, and what stops it
 */

/**
 * Starts a run of the checkout's playground, as the global setup of a
 * Playwright suite does, for any test runner: a copy of the playground on
 * free ports, its own MongoDB, a mail sink and the dashboard of the skill
 * config's `renderer` or of the playground. `stop` stops every process the
 * run started and keeps its `evidence/` and `logs/`. Loads no Playwright.
 * The processes run detached, so a SIGINT or SIGTERM to this process stops
 * the run too, then ends the process by that signal.
 *
 * @param {RunOptions} [options] How to start it
 * @returns {Promise<StartedRun>} The ready run
 * @throws When the skill, its prepare commands or the stack fail; nothing it started is left running
 */
export async function startRun(options = {}) {
  const {
    runs: [run],
    stop,
  } = await startRuns(options, 1);
  return { run, stop };
}

/**
 * @typedef {import("./journey-load.mjs").Journey} Journey A journey: its preparation fields and its `run(ctx)` body
 * @typedef {import("./types.mjs").FeatureResult} FeatureResult The judged result: `status`, `error` and `steps[].checks[].verdict`
 */

/** A browser that refuses to open anything, so a browserless journey fails when it asks for a tab. */
const NO_BROWSER = {
  close: () => Promise.resolve(),
  newContext() {
    return Promise.reject(
      new Error(
        "ctx.tab() needs a browser and runJourney of @antelopejs/dms/e2e/run opens none: drive the backend with ctx.api() instead",
      ),
    );
  },
};

/**
 * Runs one journey without a browser, as the Playwright `dms` fixture runs
 * it: the run's fresh database, backend mode, standby and administrator
 * come from the journey's `database`, `backend`, `standby` and `onboard`
 * fields. A `ctx.tab()` call fails the journey with a message saying so.
 *
 * @param {RunState} run The run `startRun` returned
 * @param {string} feature The feature the journey belongs to
 * @param {Journey} journey The journey
 * @returns {Promise<FeatureResult>} The judged result
 */
export function runJourney(run, feature, journey) {
  return driveJourney(run, feature, journey, undefined, NO_BROWSER);
}
