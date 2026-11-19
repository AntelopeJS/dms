import { declaredSuite, startOptions } from "./suite.mjs";
import { loadRun } from "./run-state.mjs";
import { down } from "./stack.mjs";
import { startRun } from "./start.mjs";

const RUN = "DMS_E2E_RUN";

/**
 * Playwright's global setup of a journeys suite, once per `playwright test`.
 * With `DMS_E2E_RUN` set, the tests drive that run and it stops nothing; a
 * run whose dashboard is not served the way the suite asks is refused.
 * Otherwise it starts a run on the config's skill: the skill's prepare
 * commands (none with `DMS_E2E_PREBUILT=1`), then the stack, whose
 * dashboard is the development one for a `frontend: "dev"` suite. It
 * publishes the run's folder in `DMS_E2E_RUN` for the workers, and returns
 * the teardown that stops it.
 * The run outlives the worker Playwright replaces after a failed test.
 *
 * @returns {Promise<(() => Promise<void>) | undefined>} The teardown of the run it started
 * @throws When the adopted run serves its dashboard another way than the suite asks
 */
export default async function globalSetup() {
  const suite = declaredSuite();
  const adopted = process.env[RUN];
  if (adopted) {
    const mode = loadRun(adopted).frontendMode ?? "build";
    if (mode !== suite.frontend) {
      throw new Error(
        `${RUN} serves a ${mode} dashboard, and this suite runs the journeys of a ${suite.frontend} one`,
      );
    }
    return undefined;
  }
  const state = await startRun(
    startOptions(suite, process.env.DMS_E2E_PREBUILT === "1"),
    process.cwd(),
  );
  process.env[RUN] = state.dir;
  return async () => {
    const lines = await down(loadRun(state.dir));
    for (const line of lines.filter((entry) => entry.startsWith("could not")))
      process.stderr.write(`dms-control: ${line}\n`);
  };
}

/**
 * The run this `playwright test` drives, read again for each test: tests run
 * one at a time, and each saves the run before the next reads it.
 *
 * @returns {import("./run-state.mjs").RunState} The run
 * @throws When no global setup published a run
 */
export function currentRun() {
  const dir = process.env[RUN];
  if (!dir) {
    throw new Error(
      `${RUN} is not set: run the suite through its config, whose global setup starts a run, or set it to a run of dms-control up`,
    );
  }
  return loadRun(dir);
}
