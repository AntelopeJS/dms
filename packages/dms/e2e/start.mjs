import { resolve } from "node:path";
import { checkoutOf } from "./git.mjs";
import { up } from "./stack.mjs";
import { loadSkill, runPrepare } from "./verify/skill.mjs";

/**
 * @typedef {Omit<import("./stack.mjs").UpOptions, "playground" | "prepared"> & { playground?: string, prepare?: boolean }} StartOptions How to start a run: `prepare` first runs the skill's install and build commands, `skill` is the verify skill folder (the checkout's one `.agents/skills/verify-*` folder when absent), `playground` and `renderer` win over the skill's config, and `noStandby` is also on with `DMS_CONTROL_NO_STANDBY=1`
 * @typedef {{ skill?: string, frontend?: "build" | "dev", prepare?: boolean }} RunOptions How a test starts a run: `skill` is the verify skill folder, relative to the repository root, for a repository with several; `frontend: "dev"` serves the dashboard with `ajs dms dev` instead of a build; `prepare` runs the skill's install and build commands first, which it does unless `DMS_E2E_PREBUILT=1`
 */

/**
 * How the stack of a test's run starts, the skill folder resolved against
 * the root of the checkout `cwd` is in.
 *
 * @param {RunOptions} options How the test starts its run
 * @param {string} cwd Where the run starts from
 * @returns {StartOptions} How its stack starts
 */
export function startOptions(options, cwd) {
  const root = checkoutOf(cwd).root ?? cwd;
  return {
    prepare: options.prepare ?? process.env.DMS_E2E_PREBUILT !== "1",
    skill:
      options.skill === undefined ? undefined : resolve(root, options.skill),
    frontendMode: options.frontend ?? "build",
  };
}

/**
 * The playground and the renderer checkout a run starts: the options, then
 * the skill's `verify.config.ts`.
 *
 * @param {Pick<StartOptions, "playground" | "renderer" | "skill">} options
 * @param {string} cwd Where the run starts from, which finds the skill
 * @returns {Promise<{ playground: string, renderer: string | undefined }>}
 */
export async function targetOf(options, cwd) {
  const skill =
    options.playground && options.renderer
      ? null
      : await loadSkill(options.skill, cwd).catch(() => null);
  const fromSkill = (/** @type {string | undefined} */ folder) =>
    skill && folder ? resolve(skill.repo, folder) : undefined;
  return {
    playground:
      options.playground ?? fromSkill(skill?.config.playground) ?? "playground",
    renderer: options.renderer ?? fromSkill(skill?.config.renderer),
  };
}

/**
 * Starts the stack of a run: with `prepare`, the skill's install and build
 * commands first, then the stack on the skill's playground and renderer.
 *
 * @param {StartOptions} options How to start it
 * @param {string} cwd Where the run starts from, which finds the skill
 * @returns {Promise<import("./run-state.mjs").RunState>} The ready run
 */
export async function startStack(options, cwd) {
  const { prepare, ...upOptions } = options;
  const skill = options.skill ? resolve(options.skill) : undefined;
  /** @type {import("./timing.mjs").TimingEntry[]} */
  let prepared = [];
  if (prepare) {
    const loaded = await loadSkill(skill, cwd);
    prepared = runPrepare(loaded, loaded.repo);
  }
  const state = await up({
    ...upOptions,
    ...(await targetOf(options, cwd)),
    skill,
    prepared,
    noStandby:
      options.noStandby === true || process.env.DMS_CONTROL_NO_STANDBY === "1",
  });
  if (state.frontendBuild?.reason) {
    process.stderr.write(
      `dms-control: the frontend build was not cached: ${state.frontendBuild.reason}\n`,
    );
  }
  return state;
}
