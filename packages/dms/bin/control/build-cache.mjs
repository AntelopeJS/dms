import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  bakedVariables,
  buildInputs,
  buildKey,
  sourceNames,
  WORKSPACE_FOLDER,
} from "./build-key.mjs";
import { describeFailure } from "./failure.mjs";
import { PREPARED_WORKSPACE_REFUSED } from "./frontend-workspace.mjs";
import { ExitError } from "./processes.mjs";

const READY_MARK = ".dms-control-ready";
const OUTPUTS = "outputs";
const INPUTS = "inputs.json";
const PENDING_PREFIX = ".pending-";
const PENDING_AGE_MS = 3_600_000;
const SUFFIX_BYTES = 4;

/** How many frontend builds the cache keeps, the most recently used first. */
export const KEPT_BUILDS = 5;

/**
 * @typedef {import("./build-key.mjs").KeyedRun & Pick<import("./run-state.mjs").RunState, "runPlayground" | "frontendBuild">} BuildingRun The run whose frontend build is laid out
 * @typedef {{ prepare: (workspace: string) => Promise<void>, build: (prepared: boolean) => Promise<void> }} FrontendSteps How a run sets its frontend workspace up (the setup and install `ajs dms build` runs first) and builds: in that prepared workspace, or with `ajs dms build` as it is
 * @typedef {{ prepared: import("./build-key.mjs").PreparedWorkspace, inputs: import("./build-key.mjs").BuildInputs, key: string }} PreparedBuild A prepared workspace, what it hashes and the key
 */

/**
 * Where frontend builds are cached: `dms-control/frontend` under
 * `XDG_CACHE_HOME`, else `~/.cache`.
 *
 * @returns {string} The cache folder
 */
function frontendCache() {
  const cacheHome = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return join(cacheHome, "dms-control", "frontend");
}

/**
 * Recreates `source` at `target`: folders and relative symbolic links anew,
 * files copied, so a later write to either side leaves the other unchanged.
 *
 * @param {string} source The entry to recreate
 * @param {string} target Where, which must not exist
 * @throws On an absolute symbolic link, which would point into the run that built it, or when `target` exists
 */
function copyEntry(source, target) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    const link = readlinkSync(source);
    if (isAbsolute(link)) throw new Error(`${source} links to ${link}`);
    symlinkSync(link, target);
  } else if (stat.isDirectory()) {
    mkdirSync(target);
    for (const name of readdirSync(source)) {
      copyEntry(join(source, name), join(target, name));
    }
  } else {
    if (existsSync(target)) throw new Error(`${target} exists`);
    copyFileSync(source, target);
  }
}

/** @param {string} path */
function remove(path) {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    return;
  }
}

/**
 * Marks an entry the most recently used. An entry another user owns, or one
 * a prune removed meanwhile, stays as it is.
 *
 * @param {string} entry The entry
 */
function markUsed(entry) {
  const now = new Date();
  try {
    utimesSync(join(entry, READY_MARK), now, now);
  } catch {
    return;
  }
}

/**
 * Lays the output of the cached build of `key` into `workspace`, beside the
 * sources its setup wrote, and marks the build the most recently used. A
 * partial layout is removed. Never throws: a restore that fails, because
 * the entry is incomplete or pruned while it is read, reads as a miss.
 *
 * @param {string} cache The cache folder
 * @param {string} key The build key
 * @param {string} workspace The run's prepared workspace
 * @returns {boolean} Whether the cache held the build and it was laid out
 */
export function restoreBuild(cache, key, workspace) {
  const entry = join(cache, key);
  /** @type {string[]} */
  const restored = [];
  try {
    if (!existsSync(join(entry, READY_MARK))) return false;
    for (const name of readdirSync(join(entry, OUTPUTS))) {
      if (existsSync(join(workspace, name))) {
        throw new Error(`${name} exists`);
      }
      restored.push(name);
      copyEntry(join(entry, OUTPUTS, name), join(workspace, name));
    }
  } catch {
    for (const name of restored) remove(join(workspace, name));
    return false;
  }
  markUsed(entry);
  return true;
}

/**
 * @param {string} path
 * @returns {number}
 */
function modifiedAt(path) {
  try {
    return statSync(path, { throwIfNoEntry: false })?.mtimeMs ?? 0;
  } catch {
    return 0;
  }
}

/**
 * @param {string} cache
 * @param {string} name
 */
function discard(cache, name) {
  const doomed = join(
    cache,
    `${PENDING_PREFIX}${name}-${randomBytes(SUFFIX_BYTES).toString("hex")}`,
  );
  try {
    renameSync(join(cache, name), doomed);
  } catch {
    return;
  }
  remove(doomed);
}

/**
 * Keeps the `limit` most recently used builds and removes the rest, and any
 * store left pending for over an hour. A build being restored while it is
 * removed fails its restore, which then builds instead. A cache that cannot
 * be read or written is left as it is.
 *
 * @param {string} cache The cache folder
 * @param {number} limit How many builds to keep
 */
function pruneBuilds(cache, limit) {
  /** @type {string[]} */
  let names = [];
  try {
    names = readdirSync(cache);
  } catch {
    return;
  }
  const pending = names.filter((name) => name.startsWith(PENDING_PREFIX));
  const stale = pending.filter(
    (name) => Date.now() - modifiedAt(join(cache, name)) > PENDING_AGE_MS,
  );
  const unused = names
    .filter((name) => !name.startsWith(PENDING_PREFIX))
    .map((name) => ({ name, used: modifiedAt(join(cache, name, READY_MARK)) }))
    .sort((left, right) => right.used - left.used)
    .slice(limit)
    .map(({ name }) => name);
  for (const name of [...stale, ...unused]) discard(cache, name);
}

/**
 * @param {string} cache
 * @param {string} key
 * @param {unknown} inputs
 * @param {{ workspace: string, outputs: string[] }} build
 * @param {string} pending
 */
function placeBuild(cache, key, inputs, build, pending) {
  mkdirSync(join(pending, OUTPUTS), { recursive: true });
  for (const name of build.outputs) {
    copyEntry(join(build.workspace, name), join(pending, OUTPUTS, name));
  }
  writeFileSync(join(pending, INPUTS), `${JSON.stringify(inputs, null, 2)}\n`);
  writeFileSync(join(pending, READY_MARK), `${key}\n`);
  if (existsSync(join(cache, key))) return;
  try {
    renameSync(pending, join(cache, key));
  } catch (error) {
    if (!existsSync(join(cache, key, READY_MARK))) throw error;
  }
}

/**
 * Stores the output of the build in `workspace` (its `outputs` entries) as
 * the build of `key`: laid out in a pending folder, then renamed into place,
 * so a reader sees all of it or none. A build already stored under `key`
 * stays. Then prunes to {@link KEPT_BUILDS}. Never throws: a cache that
 * cannot be written leaves the run as it is.
 *
 * @param {string} cache The cache folder
 * @param {string} key The build key
 * @param {unknown} inputs What the key hashes, written beside the build
 * @param {{ workspace: string, outputs: string[] }} build The run's workspace and the entries the build wrote
 * @returns {string | null} Why the build is not in the cache, or null once it is
 */
export function storeBuild(cache, key, inputs, build) {
  const pending = join(
    cache,
    `${PENDING_PREFIX}${key}-${randomBytes(SUFFIX_BYTES).toString("hex")}`,
  );
  /** @type {string | null} */
  let failure = null;
  try {
    mkdirSync(cache, { recursive: true });
    placeBuild(cache, key, inputs, build, pending);
  } catch (error) {
    failure = describeFailure(error);
  }
  remove(pending);
  pruneBuilds(cache, KEPT_BUILDS);
  return failure;
}

/**
 * @param {BuildingRun} state
 * @param {string} frontendPackage
 * @param {FrontendSteps} steps
 * @param {string} workspace
 * @returns {Promise<PreparedBuild | { reason: string }>}
 */
async function prepareBuild(state, frontendPackage, steps, workspace) {
  try {
    await steps.prepare(workspace);
  } catch (error) {
    return {
      reason: `its workspace could not be prepared (${describeFailure(error)})`,
    };
  }
  try {
    /** @type {import("./build-key.mjs").PreparedWorkspace} */
    const prepared = {
      project: state.runPlayground ?? "",
      workspace,
      names: sourceNames(workspace),
      installed: workspace,
    };
    const inputs = buildInputs(state, frontendPackage, prepared);
    return { prepared, inputs, key: buildKey(inputs) };
  } catch (error) {
    return {
      reason: `its inputs could not be keyed (${describeFailure(error)})`,
    };
  }
}

/**
 * @param {BuildingRun} state
 * @param {string} frontendPackage
 * @param {PreparedBuild} build
 * @returns {import("./run-state.mjs").FrontendBuild}
 */
function storeConsumed(state, frontendPackage, build) {
  const { prepared, inputs, key } = build;
  const cache = frontendCache();
  try {
    const consumed = buildKey(buildInputs(state, frontendPackage, prepared));
    if (consumed !== key) {
      return {
        key: null,
        cached: false,
        reason: "its workspace sources changed while it built",
      };
    }
    const outputs = sourceNames(prepared.workspace).filter(
      (name) => !prepared.names.includes(name),
    );
    const failure = storeBuild(cache, key, inputs, {
      workspace: prepared.workspace,
      outputs,
    });
    if (failure === null) return { key, cached: false };
    return { key, cached: false, reason: `${cache} refused it (${failure})` };
  } catch (error) {
    return {
      key: null,
      cached: false,
      reason: `its workspace could not be read (${describeFailure(error)})`,
    };
  }
}

/**
 * @param {unknown} error
 * @returns {error is ExitError}
 */
function refusedPreparedWorkspace(error) {
  return (
    error instanceof ExitError && error.exitCode === PREPARED_WORKSPACE_REFUSED
  );
}

/**
 * @param {BuildingRun} state
 * @param {FrontendSteps} steps
 * @param {string} workspace
 * @param {string} reason
 * @returns {Promise<void>}
 */
async function buildAsItIs(state, steps, workspace, reason) {
  remove(workspace);
  await steps.build(false);
  state.frontendBuild = { key: null, cached: false, reason };
}

/**
 * Lays out the run's `.dms-frontend`. With `useCache`, records the `VITE_*`
 * and `NODE_ENV` variables it keys on in `state.bakedEnv`, sets the
 * workspace up (`steps.prepare`, the setup and install `ajs dms build` runs
 * before it builds) and keys the build on what that workspace holds (see
 * `buildInputs`). The cache's build of that key is laid into it; else
 * `steps.build(true)` builds in that same workspace, without setting it up
 * again, so the build reads the sources the key hashed and nothing read
 * from the checkout later. The build is stored when the workspace's sources
 * still hash to the key once it is done. Without `useCache`, when the
 * workspace cannot be prepared, or when the build refuses it (it exits with
 * `PREPARED_WORKSPACE_REFUSED`), or when its inputs cannot all be keyed
 * (see `buildInputs`), `steps.build(false)` runs `ajs dms build` as it is
 * and nothing is stored; any other failure of the build fails the
 * layout. Records the key, where the build came from and why the cache was
 * not used or filled in `state.frontendBuild`.
 *
 * @param {BuildingRun} state The run, after its project build
 * @param {string} frontendPackage The `@antelopejs/dms-frontend` folder that builds
 * @param {FrontendSteps} steps How the run prepares and builds
 * @param {boolean} useCache Whether to read and write the cache
 * @returns {Promise<void>} Resolves once the build is laid out
 */
export async function layOutFrontendBuild(
  state,
  frontendPackage,
  steps,
  useCache,
) {
  const workspace = join(state.runPlayground ?? "", WORKSPACE_FOLDER);
  if (!useCache) {
    await steps.build(false);
    state.frontendBuild = { key: null, cached: false };
    return;
  }
  state.bakedEnv = bakedVariables(process.env);
  const build = await prepareBuild(state, frontendPackage, steps, workspace);
  if ("reason" in build) {
    await buildAsItIs(state, steps, workspace, build.reason);
    return;
  }
  if (restoreBuild(frontendCache(), build.key, workspace)) {
    state.frontendBuild = { key: build.key, cached: true };
    return;
  }
  try {
    await steps.build(true);
  } catch (error) {
    if (!refusedPreparedWorkspace(error)) throw error;
    const reason = `the build refused its prepared workspace (${error.message})`;
    await buildAsItIs(state, steps, workspace, reason);
    return;
  }
  state.frontendBuild = storeConsumed(state, frontendPackage, build);
}
