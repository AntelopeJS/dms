import { join } from "node:path";
import { print } from "./commands-stack.mjs";
import { runJourneyFile } from "../../e2e/journey.mjs";
import { loadRun } from "../../e2e/run-state.mjs";
import { timed } from "../../e2e/timing.mjs";
import { doorLine, flaggedDoors, patchFiles } from "./verify/doors.mjs";
import { runFormalCheck, touchedFormalChecks } from "./verify/formal.mjs";
import { checkMap, planFor } from "./verify/map.mjs";
import { journeysFile, loadSkill } from "../../e2e/verify/skill.mjs";

/**
 * @typedef {import("./options.mjs").Values} Values
 * @typedef {import("../../e2e/run-state.mjs").RunState} RunState
 */

/**
 * @param {Values} values The options of the command line
 * @param {RunState} [state] The run, whose skill and checkout are the defaults
 * @returns {ReturnType<typeof loadSkill>} The skill
 */
function skillOf(values, state) {
  return loadSkill(
    values.skill ?? state?.skill ?? undefined,
    state?.repo ?? process.cwd(),
  );
}

/**
 * @param {Values} values The options of the command line
 * @returns {Promise<number>} The exit code
 */
async function commandMap(values) {
  const problems = await checkMap(await skillOf(values));
  for (const problem of problems) print(problem);
  return problems.length === 0 ? 0 : 1;
}

/**
 * @param {Values} values The options of the command line
 * @returns {Promise<number>} The exit code
 */
async function commandPlan(values) {
  const plan = planFor(await skillOf(values), values.base, values.all);
  print(JSON.stringify(plan, null, 2));
  return plan.unmapped.length === 0 ? 0 : 1;
}

/**
 * @param {string} dir The run root
 * @param {string} feature The feature whose journeys run
 * @param {string[]} ids The journeys to run, or none for all
 * @param {Values} values The options of the command line
 * @returns {Promise<number>} The exit code
 */
async function commandJourney(dir, feature, ids, values) {
  const state = loadRun(dir);
  const skill = await skillOf(values, state);
  const results = await runJourneyFile(state, {
    file: journeysFile(skill, feature),
    feature,
    ids,
    skill,
  });
  for (const result of results.filter((entry) => entry.status === "FAIL")) {
    print(
      `FAIL ${feature}/${result.journey} (evidence ${join(state.evidence, result.folder)})`,
    );
    for (const step of result.steps) {
      for (const check of step.checks) {
        if (check.verdict === "fail")
          print(`    ${step.name}: ${check.name} (${check.detail})`);
        if (check.verdict === "fixed")
          print(
            `    ${step.name}: ${check.name} passes: remove it from knownFailures (${check.finding})`,
          );
      }
    }
    if (result.error) print(`    ${result.error.split("\n")[0]}`);
  }
  return results.every((result) => result.status === "PASS") ? 0 : 1;
}

/**
 * @param {string | undefined} patch A patch file, or none for the diff
 * @param {Values} values The options of the command line
 * @returns {Promise<number>} The exit code
 */
async function commandDoors(patch, values) {
  const skill = await skillOf(values);
  const doors = flaggedDoors(
    skill,
    patch ? patchFiles(patch) : planFor(skill, values.base).changed,
  );
  const line = doorLine(doors);
  if (line) print(line);
  for (const door of doors) print(`  ${door.kind}: ${door.files.join(", ")}`);
  return 0;
}

/**
 * @param {string} dir The run root
 * @param {Values} values The options of the command line
 * @returns {Promise<number>} The exit code
 */
async function commandFormal(dir, values) {
  const state = loadRun(dir);
  const skill = await skillOf(values, state);
  const plan = planFor(skill, state.baseRef);
  const touched = touchedFormalChecks(skill, plan.changed);
  const checks = values.all ? skill.config.formal : touched;
  for (const check of checks) {
    const result = await timed(
      state,
      "formal",
      () => runFormalCheck(skill, state, check),
      { check: check.name },
    );
    const outcome =
      result.violated.length > 0
        ? "VIOLATED"
        : result.exitCode === 0
          ? "HOLDS"
          : "ERROR";
    const scope = touched.includes(check) ? "" : " (does not cover the diff)";
    print(
      `${outcome} ${check.name}: ${result.violated.join(", ") || "no violated rule"}${scope} (exit ${result.exitCode})`,
    );
  }
  if (checks.length === 0) print("no formal check covers the diff");
  return 0;
}

/**
 * Runs a command of the verification harness: `map`, `plan`, `journey`,
 * `doors` and `formal`.
 *
 * @param {string} command The command
 * @param {string[]} rest Its positional arguments
 * @param {Values} values Its options
 * @returns {Promise<number | undefined>} The exit code, or undefined for a command it does not own
 */
export function runVerifyCommand(command, rest, values) {
  switch (command) {
    case "map":
      return commandMap(values);
    case "plan":
      return commandPlan(values);
    case "journey":
      return commandJourney(rest[0], rest[1], rest.slice(2), values);
    case "doors":
      return commandDoors(rest[0], values);
    case "formal":
      return commandFormal(rest[0], values);
    default:
      return Promise.resolve(undefined);
  }
}
