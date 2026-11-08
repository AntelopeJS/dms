import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { git } from "./git.mjs";
import { runToEnd } from "./processes.mjs";
import { saveRun } from "./run-state.mjs";
import { runPrepare } from "./verify/skill.mjs";
import { COPY_SKIPPED, layOutCopy } from "./run-copy.mjs";
import { cliPaths, ENVIRONMENT, spec } from "./stack.mjs";
import { restartBackend } from "./backend.mjs";

const READY_MARK = ".dms-control-ready";

function baseCache() {
  const cacheHome = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(cacheHome, "dms-control", "base");
}

/**
 * A prepared worktree of the run's base ref, built once per commit under
 * `~/.cache/dms-control/base/<sha>` with the skill's `prepare` commands.
 * When the base ref has no playground folder, as in the change that adds
 * it, the worktree gets a copy of the run's playground before `prepare`.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {import("./verify/skill.mjs").Skill} skill The skill
 * @returns {{ sha: string, dir: string, playground: string }} The base commit, its worktree and its playground
 */
export function baseCheckout(state, skill) {
  const sha = git(["rev-parse", `${state.baseRef}^{commit}`], state.repo);
  const dir = join(baseCache(), sha);
  const playground = join(dir, relative(state.repo, state.playground));
  if (existsSync(join(dir, READY_MARK)) && existsSync(playground)) {
    return { sha, dir, playground };
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(baseCache(), { recursive: true });
  git(["worktree", "prune"], state.repo);
  git(["worktree", "add", "--detach", "--force", dir, sha], state.repo);
  if (!existsSync(playground)) {
    cpSync(state.playground, playground, {
      recursive: true,
      filter: (source) => !COPY_SKIPPED.has(basename(source)),
    });
  }
  runPrepare(skill, dir);
  writeFileSync(join(dir, READY_MARK), `${sha}\n`);
  return { sha, dir, playground };
}

/**
 * Runs `action` while the backend is the base version's, on the run's
 * current database, then starts the run's own backend again. An upgrade
 * journey writes data with the base version inside `action` and reads it
 * back with the head version after it.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {import("./verify/skill.mjs").Skill} skill The skill, whose `prepare` builds the base
 * @param {(sha: string) => Promise<void>} action What to do against the base backend
 * @returns {Promise<string>} The base commit
 */
export async function withBaseBackend(state, skill, action) {
  if (state.renderer) {
    throw new Error(
      "A run with --renderer has no base backend: the skill's prepare builds the renderer's repository, not the playground's.",
    );
  }
  const base = baseCheckout(state, skill);
  const { playground } = base;
  state.baseRoot = join(state.dir, "base-root");
  rmSync(state.baseRoot, { recursive: true, force: true });
  const cwd = layOutCopy(playground, base.dir, state.baseRoot);
  saveRun(state);
  await runToEnd(
    spec(
      state,
      "base-project-build",
      cliPaths(playground).ajs,
      ["project", "build", "-e", ENVIRONMENT],
      cwd,
    ),
  );
  await restartBackend(state, { playground, cwd });
  try {
    await action(base.sha);
  } finally {
    await restartBackend(state);
  }
  return base.sha;
}
