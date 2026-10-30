import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { git } from "../git.mjs";
import { CONTROL_BIN } from "../stack.mjs";
import { runPrepare } from "./skill.mjs";

const OUTPUT_LIMIT = 64 * 1024 * 1024;

function run(cwd, program, args) {
  return spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
    maxBuffer: OUTPUT_LIMIT,
  });
}

function mustRun(cwd, program, args) {
  const result = run(cwd, program, args);
  if (result.status !== 0) {
    throw new Error(
      `${program} ${args.join(" ")} failed in ${cwd}:\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

/**
 * A scratch worktree of HEAD with the current skill copied in, the patch
 * applied when there is one, and the config's `prepare` commands run.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string} label What the worktree is for
 * @param {string | null} patch The patch file, or `null` for the control
 * @returns {{ worktree: string, skill: string }} The worktree and its skill copy
 */
function prepareWorktree(skill, label, patch) {
  const worktree = mkdtempSync(
    join(tmpdir(), `${skill.name}-seeded-${label}-`),
  );
  git(["worktree", "add", "--detach", "--force", worktree, "HEAD"], skill.repo);
  const copy = join(worktree, relative(skill.repo, skill.dir));
  rmSync(copy, { recursive: true, force: true });
  cpSync(skill.dir, copy, { recursive: true });
  if (patch) mustRun(worktree, "git", ["apply", patch]);
  runPrepare(skill, worktree);
  return { worktree, skill: copy };
}

function removeWorktree(skill, worktree) {
  git(["worktree", "remove", "--force", worktree], skill.repo);
}

function runFeatureIn(prepared, skill, feature) {
  const playground = join(prepared.worktree, skill.config.playground);
  const control = (args) =>
    run(prepared.worktree, process.execPath, [CONTROL_BIN, ...args]);
  const started = control([
    "up",
    "--playground",
    playground,
    "--skill",
    prepared.skill,
  ]);
  const dir = started.stdout.trim().split("\n").at(-1) ?? "";
  if (started.status !== 0 || !existsSync(join(dir, "run.json"))) {
    return {
      run: dir,
      results: [],
      output: `up failed:\n${started.stdout}${started.stderr}`,
    };
  }
  const journeys = control([
    "journey",
    dir,
    feature,
    "--skill",
    prepared.skill,
  ]);
  control(["down", dir]);
  const file = join(dir, "evidence", feature, "feature.json");
  const results = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [];
  return { run: dir, results, output: `${journeys.stdout}${journeys.stderr}` };
}

function failsACheck(result) {
  return result.steps.some((step) => step.checks.some((check) => !check.pass));
}

function judge(feature, control, seeded) {
  const passedInControl = new Set(
    control.results
      .filter((result) => result.status === "PASS")
      .map((result) => result.journey),
  );
  const failed = seeded.results.filter((result) => result.status === "FAIL");
  const caughtBy = failed
    .filter(
      (result) => passedInControl.has(result.journey) && failsACheck(result),
    )
    .map((result) => result.journey);
  return {
    feature,
    caught: caughtBy.length > 0,
    run: seeded.run,
    controlRun: control.run,
    caughtBy,
    failingInControl: control.results
      .filter((result) => result.status === "FAIL")
      .map((result) => result.journey),
    harnessErrors: failed
      .filter((result) => !failsACheck(result))
      .map((result) => result.journey),
    output: seeded.output,
  };
}

/**
 * Runs each feature's journeys twice from scratch worktrees of HEAD: once
 * unpatched as the control, once with `seeded-breaks/<feature>.patch`. A
 * break is caught only when a journey that passes in the control fails one
 * of its checks with the patch; a failure without a failing check is a
 * harness error and does not count. Worktrees are removed; both runs keep
 * their evidence, and `seeded.json` in the patched run records the outcome.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string[]} features The features
 * @returns {Record<string, any>[]} One outcome per feature
 */
export function runSeededBreaks(skill, features) {
  const control = prepareWorktree(skill, "control", null);
  try {
    return features.map((feature) => {
      const unpatched = runFeatureIn(control, skill, feature);
      const patch = join(skill.seededBreaksDir, `${feature}.patch`);
      const seeded = prepareWorktree(skill, feature, patch);
      try {
        const outcome = judge(
          feature,
          unpatched,
          runFeatureIn(seeded, skill, feature),
        );
        if (existsSync(outcome.run)) {
          writeFileSync(
            join(outcome.run, "evidence", "seeded.json"),
            `${JSON.stringify(outcome, null, 2)}\n`,
          );
        }
        return outcome;
      } finally {
        removeWorktree(skill, seeded.worktree);
      }
    });
  } finally {
    removeWorktree(skill, control.worktree);
  }
}
