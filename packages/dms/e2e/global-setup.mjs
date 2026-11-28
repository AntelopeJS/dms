import { assertForwardedRun } from "./backend.mjs";
import { declaredSuite } from "./suite.mjs";
import { arrayOf, decode, isString } from "./json.mjs";
import { loadRun } from "./run-state.mjs";
import { startRuns } from "./start.mjs";

/** @typedef {import("./suite.mjs").Suite} Suite */

const RUN = "DMS_E2E_RUN";
const LANES = "DMS_E2E_LANES";
const isLanes = arrayOf(isString);

/**
 * Playwright's global setup of a journeys suite, once per `playwright test`.
 * With `DMS_E2E_RUN` set, the tests drive that run and it stops nothing; a
 * run whose dashboard is not served the way the suite asks is refused, and
 * so are several workers, which would share it. Several workers are refused
 * too when the config starts a `webServer`, a server every worker would
 * share, such as a mock of an outside API. Otherwise it starts one run
 * per worker through `startRuns`: the journeys config's prepare commands
 * (none with `DMS_E2E_PREBUILT=1`), then the stacks, whose dashboard is the
 * development one for a `frontend: "dev"` suite. It publishes the runs'
 * folders in `DMS_E2E_LANES` for the workers, and returns the teardown that
 * stops them. A run outlives the worker Playwright replaces after a failed
 * test, and the replacement drives the same run.
 *
 * @param {Pick<import("@playwright/test").FullConfig, "workers" | "webServer">} config The resolved config
 * @returns {Promise<(() => Promise<void>) | undefined>} The teardown of the runs it started
 * @throws When the adopted run serves its dashboard another way than the suite asks, or several workers would share it or the config's `webServer`
 */
export default async function globalSetup({ workers, webServer }) {
  const suite = declaredSuite();
  if (workers > 1 && webServer) {
    throw new Error(
      `the config's webServer is one server that ${workers} workers would share: set workers: 1 in the suite's config`,
    );
  }
  const adopted = process.env[RUN];
  if (adopted) {
    if (workers > 1) {
      throw new Error(
        `${RUN} names one run, which ${workers} workers would share: run the suite with --workers=1`,
      );
    }
    assertServes(loadRun(adopted), suite);
    process.env[LANES] = JSON.stringify([adopted]);
    return undefined;
  }
  const { runs, stop } = await startRuns(
    { config: suite.config, frontend: suite.frontend },
    workers,
  );
  process.env[LANES] = JSON.stringify(runs.map((run) => run.dir));
  return stop;
}

/**
 * @param {import("./run-state.mjs").RunState} state A run
 * @param {Suite} suite The suite that drives it
 * @throws When the run serves its dashboard another way than the suite asks
 */
function assertServes(state, suite) {
  const mode = state.frontendMode ?? "build";
  if (mode !== suite.frontend) {
    throw new Error(
      `${RUN} serves a ${mode} dashboard, and this suite runs the journeys of a ${suite.frontend} one`,
    );
  }
}

/**
 * The run the worker of `lane` drives, which the global setup published. A
 * worker reads it once: its tests run one at a time, each saves the run
 * when it ends, and the worker Playwright starts in its place after a
 * failed test reads it again.
 *
 * @param {Suite} suite The suite that drives it
 * @param {number} lane The worker's `parallelIndex`
 * @returns {import("./run-state.mjs").RunState} The run
 * @throws When no global setup published a run for the lane, an older e2e kit started it, or it serves its dashboard another way than the suite asks
 */
export function currentRun(suite, lane) {
  const recorded = process.env[LANES];
  if (!recorded) {
    throw new Error(
      `${LANES} is not set: run the suite through its config, whose global setup starts its runs`,
    );
  }
  const lanes = decode(isLanes, JSON.parse(recorded), LANES, "run folders");
  const dir = lanes[lane];
  if (dir === undefined) {
    throw new Error(
      `worker ${lane} has no run: the global setup started ${lanes.length}`,
    );
  }
  const state = loadRun(dir);
  assertServes(state, suite);
  assertForwardedRun(state);
  return state;
}
