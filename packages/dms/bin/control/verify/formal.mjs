import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, matchesGlob, relative } from "node:path";
import { behaviourChange, inWorktree } from "./behaviour.mjs";

const OUTPUT_LIMIT = 64 * 1024 * 1024;

function changesCheckFiles(check, changed) {
  return changed.some((file) =>
    (check.files ?? []).some((glob) => matchesGlob(file, glob)),
  );
}

/**
 * The formal checks whose covered files or own `files` a set of changed files touches.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string[]} changed Repository paths
 * @returns {Record<string, any>[]} The checks
 */
export function touchedFormalChecks(skill, changed) {
  return skill.config.formal.filter(
    (check) =>
      changed.some((file) => check.covers.includes(file)) ||
      changesCheckFiles(check, changed),
  );
}

function violatedRules(check, exitCode, output) {
  if (check.violation) {
    return [
      ...new Set(
        [...output.matchAll(check.violation)].map((match) => match[1]),
      ),
    ];
  }
  return exitCode === 0 ? [] : ["property"];
}

function runCommand(command, cwd) {
  const [program, ...args] = command;
  return spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: OUTPUT_LIMIT,
  });
}

function writeRun(folder, prefix, command, run) {
  writeFileSync(join(folder, `${prefix}command.txt`), `${command.join(" ")}\n`);
  writeFileSync(join(folder, `${prefix}stdout.txt`), run.stdout ?? "");
  writeFileSync(
    join(folder, `${prefix}stderr.txt`),
    `${run.stderr ?? ""}${run.error ? `\n${run.error.message}\n` : ""}`,
  );
  writeFileSync(join(folder, `${prefix}exit-code.txt`), `${run.status}\n`);
}

function passingRules(check, output) {
  return check.passing
    ? [...new Set([...output.matchAll(check.passing)].map((match) => match[1]))]
    : [];
}

function rulesOf(check, run) {
  return {
    exitCode: run.status,
    violated: violatedRules(check, run.status, run.stdout ?? ""),
    passing: passingRules(check, run.stdout ?? ""),
  };
}

function baseRules(skill, check, baseSha, folder) {
  const command = check.baseCommand ?? check.command;
  const run = inWorktree(skill.repo, baseSha, (dir) =>
    runCommand(command, dir),
  );
  writeRun(folder, "base-", command, run);
  return rulesOf(check, run);
}

function gateFields(skill, check, diff, folder, head) {
  const behaviour = behaviourChange(skill, check, diff);
  const checkChanged = changesCheckFiles(check, diff.changed);
  if (!behaviour.changed && !checkChanged)
    return { behaviour, checkChanged, base: null, fixed: [], missing: [] };
  const base = baseRules(skill, check, diff.baseSha, folder);
  const atHead = new Set([...head.violated, ...head.passing]);
  return {
    behaviour,
    checkChanged,
    base,
    fixed: base.violated.filter(
      (rule) => head.passing.includes(rule) && !head.violated.includes(rule),
    ),
    missing: base.violated.filter((rule) => !atHead.has(rule)),
  };
}

/**
 * Runs one formal check from the repository root and writes its command,
 * output, exit code and violated rules under `evidence/formal/<name>/`.
 * When the diff touches the check (`diff` given), it also records whether
 * the diff changed the behaviour of the covered code. When it did, or when
 * the diff changed the check's own `files`, it runs the check on the base:
 * `fixed` lists the rules the base broke that HEAD reports passing, and
 * `missing` the rules the base broke that HEAD reports neither failing nor passing.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {Record<string, any>} check The check
 * @param {{ baseSha: string, headSha: string, changed: string[] } | null} diff The diff's base, head and changed files, for a check that covers it
 * @returns {Record<string, any>} The result
 */
export function runFormalCheck(skill, state, check, diff) {
  const folder = join(state.evidence, "formal", check.name);
  mkdirSync(folder, { recursive: true });
  const run = runCommand(check.command, skill.repo);
  writeRun(folder, "", check.command, run);
  const head = rulesOf(check, run);
  const result = {
    name: check.name,
    exitCode: run.status,
    violated: head.violated,
    passing: head.passing,
    folder: relative(state.evidence, folder),
  };
  if (diff) {
    const commits = { baseSha: diff.baseSha, headSha: diff.headSha };
    Object.assign(
      result,
      { commits },
      gateFields(skill, check, diff, folder, head),
    );
  }
  writeFileSync(
    join(folder, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

/**
 * How a formal check's result weighs on a verdict whose diff it covers: a
 * non-zero exit (a tool error, or a check that no longer matches its
 * record) fails; recorded findings fail only when the diff changed the
 * covered code's behaviour; a rule the base reported and HEAD no longer
 * reports fails; rules the base broke that HEAD reports passing are fixed.
 *
 * @param {Record<string, any>} result The recorded result
 * @returns {{ fails: boolean, outcome: string }} The weight and its wording
 */
export function formalGate(result) {
  if (result.exitCode !== 0) {
    const what =
      result.violated.length > 0
        ? `the check no longer matches its record: ${result.violated.join(", ")}`
        : "tool error";
    return { fails: true, outcome: `${what}, exit ${result.exitCode}` };
  }
  if (result.missing?.length > 0) {
    return {
      fails: true,
      outcome: `rules the base broke are absent at HEAD: ${result.missing.join(", ")}`,
    };
  }
  const fixed =
    result.fixed?.length > 0 ? `; fixed: ${result.fixed.join(", ")}` : "";
  if (!result.behaviour) {
    return {
      fails: result.violated.length > 0,
      outcome: `violated ${result.violated.join(", ") || "nothing"}`,
    };
  }
  const how = `${result.behaviour.method}`;
  if (!result.behaviour.changed) {
    const known =
      result.violated.length > 0
        ? `known findings ${result.violated.join(", ")}`
        : "no violated rule";
    return {
      fails: false,
      outcome: `covered behaviour unchanged (${how}): ${known}`,
    };
  }
  if (result.violated.length === 0) {
    return {
      fails: false,
      outcome: `covered behaviour changed (${how}), no violated rule${fixed}`,
    };
  }
  return {
    fails: true,
    outcome: `covered behaviour changed (${how}), violated ${result.violated.join(", ")}${fixed}`,
  };
}

/**
 * The recorded result of a formal check in a run, if it ran.
 *
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {string} name The check
 * @returns {Record<string, any> | undefined} The result
 */
export function readFormalResult(state, name) {
  const file = join(state.evidence, "formal", name, "result.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}
