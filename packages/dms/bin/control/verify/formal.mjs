import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { behaviourChange, inWorktree } from "./behaviour.mjs";

const OUTPUT_LIMIT = 64 * 1024 * 1024;

/**
 * The formal checks whose covered files a set of changed files touches.
 *
 * @param {Record<string, any>} skill The skill
 * @param {string[]} changed Repository paths
 * @returns {Record<string, any>[]} The checks
 */
export function touchedFormalChecks(skill, changed) {
  return skill.config.formal.filter((check) =>
    changed.some((file) => check.covers.includes(file)),
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

function baseViolations(skill, check, baseSha, folder) {
  const command = check.baseCommand ?? check.command;
  const run = inWorktree(skill.repo, baseSha, (dir) =>
    runCommand(command, dir),
  );
  writeRun(folder, "base-", command, run);
  return {
    exitCode: run.status,
    violated: violatedRules(check, run.status, run.stdout ?? ""),
  };
}

function gateFields(skill, check, commits, folder, violated) {
  const behaviour = behaviourChange(skill, check, commits);
  if (!behaviour.changed) return { behaviour, base: null, fixed: [] };
  const base = baseViolations(skill, check, commits.baseSha, folder);
  return {
    behaviour,
    base,
    fixed: base.violated.filter((rule) => !violated.includes(rule)),
  };
}

/**
 * Runs one formal check from the repository root and writes its command,
 * output, exit code and violated rules under `evidence/formal/<name>/`.
 * When the diff touches the check (`commits` given), it also records
 * whether the diff changed the behaviour of the covered code and, when it
 * did, the rules the base violated that HEAD no longer does (`fixed`).
 *
 * @param {Record<string, any>} skill The skill
 * @param {Record<string, any>} state The run
 * @param {Record<string, any>} check The check
 * @param {{ baseSha: string, headSha: string } | null} commits The diff's base and head, for a check that covers it
 * @returns {Record<string, any>} The result
 */
export function runFormalCheck(skill, state, check, commits) {
  const folder = join(state.evidence, "formal", check.name);
  mkdirSync(folder, { recursive: true });
  const run = runCommand(check.command, skill.repo);
  writeRun(folder, "", check.command, run);
  const violated = violatedRules(check, run.status, run.stdout ?? "");
  const result = {
    name: check.name,
    exitCode: run.status,
    violated,
    folder: relative(state.evidence, folder),
  };
  if (commits) {
    Object.assign(
      result,
      { commits },
      gateFields(skill, check, commits, folder, violated),
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
 * covered code's behaviour; rules the base broke and HEAD no longer does
 * are reported as fixed.
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
 * @param {Record<string, any>} state The run
 * @param {string} name The check
 * @returns {Record<string, any> | undefined} The result
 */
export function readFormalResult(state, name) {
  const file = join(state.evidence, "formal", name, "result.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}
