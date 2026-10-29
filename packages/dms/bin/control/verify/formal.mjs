import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

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

/**
 * Runs one formal check from the repository root and writes its command,
 * output, exit code and violated rules under `evidence/formal/<name>/`.
 *
 * @param {Record<string, any>} skill The skill
 * @param {Record<string, any>} state The run
 * @param {Record<string, any>} check The check
 * @returns {{ name: string, exitCode: number | null, violated: string[], folder: string }} The result
 */
export function runFormalCheck(skill, state, check) {
  const folder = join(state.evidence, "formal", check.name);
  mkdirSync(folder, { recursive: true });
  const [program, ...args] = check.command;
  const run = spawnSync(program, args, { cwd: skill.repo, encoding: "utf8" });
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
