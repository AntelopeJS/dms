import { parseArgs } from "node:util";
import { startRun } from "./commands-stack.mjs";
import { OPTIONS } from "./options.mjs";
import { loadRun } from "./run-state.mjs";
import { down } from "./stack.mjs";

const RUN = "DMS_E2E_RUN";

/**
 * Playwright's global setup of a journeys suite, once per `playwright test`.
 * With `DMS_E2E_RUN` set, the tests drive that run and it stops nothing.
 * Otherwise it starts a run as `dms-control up --prepare` does (`up` alone
 * with `DMS_E2E_PREBUILT=1`), publishes its folder in `DMS_E2E_RUN` for the
 * workers, and returns the teardown that stops it. The run outlives the
 * worker Playwright replaces after a failed test.
 *
 * @returns {Promise<(() => Promise<void>) | undefined>} The teardown of the run it started
 */
export default async function globalSetup() {
  if (process.env[RUN]) return undefined;
  const args = process.env.DMS_E2E_PREBUILT === "1" ? [] : ["--prepare"];
  const { values } = parseArgs({ args, options: OPTIONS });
  const state = await startRun(values, process.cwd());
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
