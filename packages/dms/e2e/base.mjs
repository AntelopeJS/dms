import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { git } from "./git.mjs";
import { runToEnd } from "./processes.mjs";
import { saveRun } from "./run-state.mjs";
import { runPrepare } from "./journeys-config.mjs";
import { COPY_SKIPPED, layOutCopy } from "./run-copy.mjs";
import { cliPaths, ENVIRONMENT, spec } from "./launch.mjs";
import { restartBackend } from "./backend.mjs";
import { moduleRootOf } from "./module-root.mjs";

const READY_MARK = ".dms-e2e-ready";

function baseCache() {
  const cacheHome = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(cacheHome, "dms-e2e", "base");
}

/**
 * A prepared worktree of the run's base ref, built once per commit under
 * `~/.cache/dms-e2e/base/<sha>` with the journeys config's `prepare` commands.
 * When the base ref has no playground folder, as in the change that adds
 * it, the worktree gets a copy of the run's playground before `prepare`,
 * and is built again on every call so the copy follows the run's.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {Pick<import("./journeys-config.mjs").SuiteConfig, "prepare">} config The journeys config
 * @returns {{ sha: string, dir: string, playground: string }} The base commit, its worktree and its playground
 */
export function baseCheckout(state, config) {
  const sha = git(["rev-parse", `${state.baseRef}^{commit}`], state.repo);
  const dir = join(baseCache(), sha);
  const path = relative(state.repo, state.playground);
  const playground = join(dir, path);
  const copied =
    git(["ls-tree", "-d", "--name-only", sha, "--", path], state.repo) === "";
  if (!copied && existsSync(join(dir, READY_MARK))) {
    return { sha, dir, playground };
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(baseCache(), { recursive: true });
  git(["worktree", "prune"], state.repo);
  git(["worktree", "add", "--detach", "--force", dir, sha], state.repo);
  if (copied) {
    cpSync(state.playground, playground, {
      recursive: true,
      filter: (source) => !COPY_SKIPPED.has(basename(source)),
    });
  }
  runPrepare(config, dir);
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
 * @param {Pick<import("./journeys-config.mjs").SuiteConfig, "prepare">} config The journeys config, whose `prepare` builds the base
 * @param {(sha: string) => Promise<void>} action What to do against the base backend
 * @returns {Promise<string>} The base commit
 */
export async function withBaseBackend(state, config, action) {
  if (state.renderer) {
    throw new Error(
      "A run with a journeys config renderer has no base backend: the journeys config's prepare builds the renderer's repository, not the playground's.",
    );
  }
  const base = baseCheckout(state, config);
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
  await restartBackend(state, {
    playground,
    cwd,
    moduleRoot: moduleRootOf(playground, base.dir),
  });
  try {
    await action(base.sha);
  } finally {
    await restartBackend(state);
  }
  return base.sha;
}
