import { resolve } from "node:path";
import { checkoutOf } from "./git.mjs";
import { up } from "./stack.mjs";
import { loadSuiteConfig, runPrepare } from "./journeys-config.mjs";

/**
 * @typedef {Omit<import("./stack.mjs").UpOptions, "playground" | "prepared"> & { playground?: string, prepare?: boolean, config?: string }} StartOptions How to start a run: `config` is the absolute path of a journeys config file, `prepare` first runs the journeys config's install and build commands, `playground` and `renderer` win over the journeys config, and `noStandby` is also on with `DMS_E2E_NO_STANDBY=1`
 * @typedef {{ config?: string, frontend?: "build" | "dev", prepare?: boolean }} RunOptions How a test starts a run: `config` is a journeys config file, relative to the repository root, whose journeys folder is `journeys/` beside it (`e2e/journeys.config.ts` by default); `frontend: "dev"` serves the dashboard with `ajs dms dev` instead of a build; `prepare` runs the journeys config's install and build commands first, which it does unless `DMS_E2E_PREBUILT=1`
 */

/**
 * How the stack of a test's run starts, the journeys config resolved
 * against the root of the checkout `cwd` is in.
 *
 * @param {RunOptions} options How the test starts its run
 * @param {string} cwd Where the run starts from
 * @returns {StartOptions} How its stack starts
 */
export function startOptions(options, cwd) {
  const root = checkoutOf(cwd).root ?? cwd;
  /** @type {StartOptions} */
  const start = {
    prepare: options.prepare ?? process.env.DMS_E2E_PREBUILT !== "1",
    frontendMode: options.frontend ?? "build",
  };
  if (options.config !== undefined)
    start.config = resolve(root, options.config);
  return start;
}

/**
 * The playground and the renderer checkout a run starts: the options, then
 * the journeys config.
 *
 * @param {Pick<StartOptions, "playground" | "renderer" | "config">} options
 * @param {string} cwd Where the run starts from, which finds the journeys config
 * @returns {Promise<{ playground: string, renderer: string | undefined }>}
 */
export async function targetOf(options, cwd) {
  const config =
    options.playground && options.renderer
      ? null
      : await loadSuiteConfig(cwd, options.config).catch(() => null);
  return {
    playground: options.playground ?? config?.playground ?? "playground",
    renderer: options.renderer ?? config?.renderer,
  };
}

/**
 * Starts the stack of a run: with `prepare`, the journeys config's install
 * and build commands first, then the stack on its playground and renderer.
 *
 * @param {StartOptions} options How to start it
 * @param {string} cwd Where the run starts from, which finds the journeys config
 * @returns {Promise<import("./run-state.mjs").RunState>} The ready run
 */
export async function startStack(options, cwd) {
  const { prepare, config: journeysConfig, ...upOptions } = options;
  /** @type {import("./timing.mjs").TimingEntry[]} */
  let prepared = [];
  if (prepare) {
    const config = await loadSuiteConfig(cwd, journeysConfig);
    prepared = runPrepare(config, config.repo);
  }
  const state = await up({
    ...upOptions,
    ...(await targetOf(options, cwd)),
    prepared,
    noStandby:
      options.noStandby === true || process.env.DMS_E2E_NO_STANDBY === "1",
  });
  if (state.frontendBuild?.reason) {
    process.stderr.write(
      `dms-e2e: the frontend build was not cached: ${state.frontendBuild.reason}\n`,
    );
  }
  return state;
}
