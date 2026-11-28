import { resolve } from "node:path";
import { checkoutOf } from "./git.mjs";
import { loadRun } from "./run-state.mjs";
import { down, up } from "./stack.mjs";
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
 * Runs the journeys config's install and build commands when `options`
 * asks for them.
 *
 * @param {StartOptions} options How the runs start
 * @param {string} cwd Where the runs start from, which finds the journeys config
 * @returns {Promise<import("./timing.mjs").TimingEntry[]>} The timings of the commands, none when it ran nothing
 */
async function prepareRuns(options, cwd) {
  if (!options.prepare) return [];
  const config = await loadSuiteConfig(cwd, options.config);
  return runPrepare(config, config.repo);
}

/**
 * Starts the stack of a run on its playground and renderer, the journeys
 * config's commands already run.
 *
 * @param {StartOptions} options How to start it
 * @param {import("./timing.mjs").TimingEntry[]} prepared The timings of the commands, which the run records
 * @param {string} cwd Where the run starts from, which finds the journeys config
 * @returns {Promise<import("./run-state.mjs").RunState>} The ready run
 */
export async function startStack(options, prepared, cwd) {
  const { prepare: _prepare, config: _journeysConfig, ...upOptions } = options;
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

/** @type {NodeJS.Signals[]} */
const STOP_SIGNALS = ["SIGINT", "SIGTERM"];

/**
 * Stops a run from what its `run.json` recorded last, which the journeys of
 * other processes update, and reports what it could not do on stderr.
 *
 * @param {string} dir The run folder
 */
async function stopRun(dir) {
  const lines = await down(loadRun(dir));
  for (const line of lines.filter((entry) => entry.startsWith("could not")))
    process.stderr.write(`dms-e2e: ${line}\n`);
}

/**
 * Stops the runs in `dirs` together, each to its end whatever the others do.
 *
 * @param {string[]} dirs The run folders
 * @returns {Promise<void>}
 * @throws The first failure, once every run stopped
 */
async function stopRuns(dirs) {
  const stopped = await Promise.allSettled(dirs.map(stopRun));
  const failed = stopped.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

/**
 * Starts `count` runs of the checkout's playground, each with its own
 * playground copy, ports, MongoDB, mail sink, backends and dashboard, for
 * the workers of one suite to drive one each. The journeys config's prepare
 * commands run first, once, as `options` asks; then every run starts at the
 * same time. `stop` stops them all, and from the moment the runs start a
 * SIGINT or SIGTERM to this process stops every run ready so far, then
 * ends the process by that signal.
 *
 * @param {RunOptions} options How to start them
 * @param {number} count How many, at least 1
 * @returns {Promise<{ runs: import("./run-state.mjs").RunState[], stop: () => Promise<void> }>} The ready runs, one per worker, and what stops them
 * @throws When a run fails to start; every run that started is stopped first
 */
export async function startRuns(options, count) {
  const cwd = process.cwd();
  const start = startOptions(options, cwd);
  const prepared = await prepareRuns(start, cwd);
  /** @type {string[]} */
  const dirs = [];
  const onSignal = (/** @type {NodeJS.Signals} */ signal) => {
    release();
    const reraise = () => process.kill(process.pid, signal);
    stopRuns(dirs).then(reraise, reraise);
  };
  const release = () => {
    for (const signal of STOP_SIGNALS) process.off(signal, onSignal);
  };
  for (const signal of STOP_SIGNALS) process.on(signal, onSignal);
  const started = await Promise.allSettled(
    Array.from({ length: count }, async (_, index) => {
      const run = await startStack(start, index === 0 ? prepared : [], cwd);
      dirs.push(run.dir);
      return run;
    }),
  );
  const failed = started.find((run) => run.status === "rejected");
  if (failed) {
    release();
    await stopRuns(dirs);
    throw failed.reason;
  }
  return {
    runs: started.flatMap((run) =>
      run.status === "fulfilled" ? [run.value] : [],
    ),
    stop: () => {
      release();
      return stopRuns(dirs);
    },
  };
}
