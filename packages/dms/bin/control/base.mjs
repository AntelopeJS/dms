import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { git } from "./git.mjs";
import { runToEnd } from "./processes.mjs";
import { saveRun } from "./run-state.mjs";
import {
  cliPaths,
  ENVIRONMENT,
  layOutCopy,
  restartBackend,
  spec,
} from "./stack.mjs";

const READY_MARK = ".dms-control-ready";
const OUTPUT_LIMIT = 64 * 1024 * 1024;

function baseCache() {
  const cacheHome = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(cacheHome, "dms-control", "base");
}

function mustRun(cwd, program, args) {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: OUTPUT_LIMIT,
    env: { ...process.env, CI: "1" },
  });
  if (result.status !== 0) {
    throw new Error(
      `${program} ${args.join(" ")} failed in ${cwd}:\n${result.stdout}${result.stderr}`,
    );
  }
}

/**
 * A prepared worktree of the run's base ref, built once per commit under
 * `~/.cache/dms-control/base/<sha>` with the skill's `prepare` commands.
 *
 * @param {Record<string, any>} state The run
 * @param {Record<string, any>} skill The skill
 * @returns {{ sha: string, dir: string }} The base commit and its worktree
 */
function baseCheckout(state, skill) {
  const sha = git(["rev-parse", `${state.baseRef}^{commit}`], state.repo);
  const dir = join(baseCache(), sha);
  if (existsSync(join(dir, READY_MARK))) return { sha, dir };
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(baseCache(), { recursive: true });
  git(["worktree", "prune"], state.repo);
  git(["worktree", "add", "--detach", "--force", dir, sha], state.repo);
  for (const [program, ...args] of skill.config.prepare)
    mustRun(dir, program, args);
  writeFileSync(join(dir, READY_MARK), `${sha}\n`);
  return { sha, dir };
}

/**
 * Runs `action` while the backend is the base version's, on the run's
 * current database, then starts the run's own backend again. A Format
 * containment journey writes data with the base version inside `action`
 * and reads it back with the head version after it.
 *
 * @param {Record<string, any>} state The run
 * @param {Record<string, any>} skill The skill, whose `prepare` builds the base
 * @param {(sha: string) => Promise<void>} action What to do against the base backend
 * @returns {Promise<string>} The base commit
 */
export async function withBaseBackend(state, skill, action) {
  const base = baseCheckout(state, skill);
  const playground = join(base.dir, relative(state.repo, state.playground));
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
