import { runJourney as driveJourney } from "./journey-run.mjs";
import { loadRun } from "./run-state.mjs";
import { down } from "./stack.mjs";
import { startOptions, startStack } from "./start.mjs";

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
 *
 * @param {RunOptions} [options] How to start it
 * @returns {Promise<StartedRun>} The ready run
 * @throws When the skill, its prepare commands or the stack fail; nothing it started is left running
 */
export async function startRun(options = {}) {
  const cwd = process.cwd();
  const run = await startStack(startOptions(options, cwd), cwd);
  return { run, stop: () => stopRun(run.dir) };
}

/**
 * Stops a run from what its `run.json` recorded last, which the journeys of
 * other processes update, and reports what it could not do on stderr.
 *
 * @param {string} dir The run folder
 */
async function stopRun(dir) {
  const lines = await down(loadRun(dir));
  for (const line of lines.filter((entry) => entry.startsWith("could not")))
    process.stderr.write(`dms-control: ${line}\n`);
}

/**
 * @typedef {import("./journey-load.mjs").Journey} Journey A journey: its preparation fields and its `run(ctx)` body
 * @typedef {import("./verify/types.mjs").FeatureResult} FeatureResult The judged result: `status`, `error` and `steps[].checks[].verdict`
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
