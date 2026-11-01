import { join } from "node:path";
import { print } from "./commands-stack.mjs";
import { runJourneyFile } from "./journey.mjs";
import { loadRun } from "./run-state.mjs";
import { doorLine, flaggedDoors, patchFiles } from "./verify/doors.mjs";
import {
  formalGate,
  runFormalCheck,
  touchedFormalChecks,
} from "./verify/formal.mjs";
import { readJudgement } from "./verify/judgement.mjs";
import { checkMap, planFor } from "./verify/map.mjs";
import {
  postComment,
  pushEvidence,
  readStatus,
  setStatus,
} from "./verify/publish.mjs";
import { runSeededBreaks } from "./verify/seeded.mjs";
import { journeysFile, loadSkill } from "./verify/skill.mjs";
import { renderVerdict } from "./verify/verdict.mjs";

function skillOf(values, state) {
  return loadSkill(
    values.skill ?? state?.skill ?? undefined,
    state?.repo ?? process.cwd(),
  );
}

async function commandMap(values) {
  const problems = await checkMap(await skillOf(values));
  for (const problem of problems) print(problem);
  return problems.length === 0 ? 0 : 1;
}

async function commandPlan(values) {
  const plan = planFor(await skillOf(values), values.base);
  print(JSON.stringify(plan, null, 2));
  return plan.unmapped.length === 0 ? 0 : 1;
}

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
      for (const check of step.checks.filter((entry) => !entry.pass))
        print(`    ${step.name}: ${check.name} (${check.detail})`);
    }
    if (result.error) print(`    ${result.error.split("\n")[0]}`);
  }
  return results.every((result) => result.status === "PASS") ? 0 : 1;
}

async function commandSeeded(features, values) {
  const skill = await skillOf(values);
  const outcomes = runSeededBreaks(skill, features);
  for (const outcome of outcomes) {
    print(
      `${outcome.caught ? "CAUGHT" : "MISSED"} ${outcome.feature} by ${outcome.caughtBy.join(", ") || "no journey"} (evidence ${outcome.run}/evidence/${outcome.feature}, control ${outcome.controlRun}/evidence/${outcome.feature})`,
    );
    if (outcome.failingInControl.length > 0)
      print(
        `    already failing without the patch, not counted: ${outcome.failingInControl.join(", ")}`,
      );
    if (outcome.harnessErrors.length > 0)
      print(
        `    failed without a failing check (harness error), not counted: ${outcome.harnessErrors.join(", ")}`,
      );
    if (!outcome.caught) print(outcome.output.replace(/^/gm, "    "));
  }
  return outcomes.every((outcome) => outcome.caught) ? 0 : 1;
}

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

async function commandFormal(dir, values) {
  const state = loadRun(dir);
  const skill = await skillOf(values, state);
  const plan = planFor(skill, state.baseRef);
  const touched = touchedFormalChecks(skill, plan.changed);
  const checks = values.all ? skill.config.formal : touched;
  const diff = {
    baseSha: plan.baseSha,
    headSha: plan.headSha,
    changed: plan.changed,
  };
  for (const check of checks) {
    const gate = touched.includes(check);
    const result = runFormalCheck(skill, state, check, gate ? diff : null);
    const weight = formalGate(result);
    const outcome = gate
      ? weight.fails
        ? "FAIL"
        : "PASS"
      : result.violated.length > 0
        ? "VIOLATED"
        : result.exitCode === 0
          ? "HOLDS"
          : "ERROR";
    print(
      `${outcome} ${check.name}: ${gate ? weight.outcome : `${result.violated.join(", ") || "no violated rule"} (does not cover the diff)`} (exit ${result.exitCode})`,
    );
  }
  if (checks.length === 0) print("no formal check covers the diff");
  return 0;
}

async function commandJudge(command, dir, values) {
  const pr = Number(values.pr);
  if (!Number.isInteger(pr) || pr <= 0) {
    print(`${command} needs --pr <number>`);
    return 2;
  }
  const state = loadRun(dir);
  const skill = await skillOf(values, state);
  const verdict = await renderVerdict(
    skill,
    state,
    pr,
    readJudgement(skill, join(state.evidence, "judgement.json")),
  );
  print(verdict.markdown);
  if (command !== "publish") return verdict.result === "FAIL" ? 1 : 0;
  print(`evidence commit ${pushEvidence(skill, state, verdict)}`);
  const comment = postComment(skill, verdict);
  print(`comment ${comment}`);
  const error = setStatus(skill, verdict, comment);
  if (error)
    print(`FAIL status verify on ${verdict.headSha} not set: ${error}`);
  print(
    `status verify on ${verdict.headSha}: ${readStatus(skill, verdict.headSha)}`,
  );
  return error || verdict.result === "FAIL" ? 1 : 0;
}

/**
 * Runs a command of the verification harness: `map`, `plan`, `journey`,
 * `seeded`, `doors`, `formal`, `verdict` and `publish`.
 *
 * @param {string} command The command
 * @param {string[]} rest Its positional arguments
 * @param {Record<string, any>} values Its options
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
    case "seeded":
      return commandSeeded(rest, values);
    case "doors":
      return commandDoors(rest[0], values);
    case "formal":
      return commandFormal(rest[0], values);
    case "verdict":
    case "publish":
      return commandJudge(command, rest[0], values);
    default:
      return Promise.resolve(undefined);
  }
}
