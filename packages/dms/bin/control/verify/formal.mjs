import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, matchesGlob, relative } from "node:path";

const OUTPUT_LIMIT = 64 * 1024 * 1024;

/**
 * The formal checks whose covered files or own `files` a set of changed files touches.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string[]} changed Repository paths
 * @returns {import("./types.mjs").FormalCheck[]} The checks
 */
export function touchedFormalChecks(skill, changed) {
  return skill.config.formal.filter((check) =>
    changed.some(
      (file) =>
        check.covers.includes(file) ||
        (check.files ?? []).some((glob) => matchesGlob(file, glob)),
    ),
  );
}

/**
 * @param {import("./types.mjs").FormalCheck} check The check
 * @param {number | null} exitCode How the run exited
 * @param {string} output What the run printed
 * @returns {string[]} The violated rules
 */
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

/**
 * Runs one formal check from the repository root and writes its command,
 * output, exit code and violated rules under `evidence/formal/<name>/`.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {import("./types.mjs").FormalCheck} check The check
 * @returns {import("./types.mjs").FormalResult} The result
 */
export function runFormalCheck(skill, state, check) {
  const folder = join(state.evidence, "formal", check.name);
  mkdirSync(folder, { recursive: true });
  const [program, ...args] = check.command;
  const run = spawnSync(program, args, {
    cwd: skill.repo,
    encoding: "utf8",
    maxBuffer: OUTPUT_LIMIT,
  });
  writeFileSync(join(folder, "command.txt"), `${check.command.join(" ")}\n`);
  writeFileSync(join(folder, "stdout.txt"), run.stdout ?? "");
  writeFileSync(
    join(folder, "stderr.txt"),
    `${run.stderr ?? ""}${run.error ? `\n${run.error.message}\n` : ""}`,
  );
  writeFileSync(join(folder, "exit-code.txt"), `${run.status}\n`);
  const result = {
    name: check.name,
    exitCode: run.status,
    violated: violatedRules(check, run.status, run.stdout ?? ""),
    folder: relative(state.evidence, folder),
  };
  writeFileSync(
    join(folder, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}
