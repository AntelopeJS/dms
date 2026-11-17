import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, sep } from "node:path";

/** @typedef {Pick<import("./run-state.mjs").RunState, "moduleRoot" | "playground" | "runPlayground" | "buildRoots">} Build Where a run's build lives, and the build folders `up` found */

/** @param {string} folder */
function entriesOf(folder) {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

/**
 * The packages `modules` links from outside any `node_modules`: workspace
 * packages, which a build rewrites, unlike installed ones.
 *
 * @param {string} modules A `node_modules` folder
 * @returns {string[]} Their real folders
 */
function workspacePackages(modules) {
  const links = entriesOf(modules).flatMap((name) =>
    name.startsWith("@")
      ? entriesOf(join(modules, name)).map((scoped) =>
          join(modules, name, scoped),
        )
      : [join(modules, name)],
  );
  return links.flatMap((link) => {
    try {
      const real = realpathSync(link);
      return real.split(sep).includes("node_modules") ? [] : [real];
    } catch {
      return [];
    }
  });
}

/**
 * The folders a backend of the run loads its code from: the module's
 * `dist`, the `dist` of each workspace package the module or the playground
 * links (`@antelopejs/interface-dms` in this repository), and the run copy's
 * playground `dist` and project build.
 *
 * @param {Build} state The run
 * @returns {string[]} The folders, missing ones included
 */
function buildInputs(state) {
  const playground = state.runPlayground ?? state.playground;
  const linked = [state.moduleRoot, state.playground].flatMap((folder) =>
    workspacePackages(join(folder, "node_modules")),
  );
  return [
    ...new Set([
      join(state.moduleRoot, "dist"),
      ...linked.map((folder) => join(folder, "dist")),
      join(playground, "dist"),
      join(playground, ".antelope", "build"),
    ]),
  ];
}

/**
 * The build folders of the run that exist now. `up` records them once its
 * build is done.
 *
 * @param {Build} state The run
 * @returns {string[]} The folders
 */
export function existingBuildRoots(state) {
  return buildInputs(state).filter((folder) => existsSync(folder));
}

/**
 * A build folder `up` found that is missing now, such as a `dist` a build
 * removed before it compiles again, or `null`. A folder the build never
 * had, such as the `dist` of a playground that compiles nothing, is not
 * one.
 *
 * @param {Build} state The run
 * @returns {string | null} The folder
 */
export function missingBuildRoot(state) {
  return (state.buildRoots ?? []).find((folder) => !existsSync(folder)) ?? null;
}

/**
 * What `path` is, its link followed. A link that leads nowhere, such as one
 * to a removed file, is only itself.
 *
 * @param {string} path
 * @param {import("node:fs").Stats} link Its own status
 * @returns {import("node:fs").Stats}
 */
function followed(path, link) {
  if (!link.isSymbolicLink()) return link;
  try {
    return statSync(path);
  } catch {
    return link;
  }
}

/**
 * The first path under `path`, links followed, whose modification or
 * status-change time is after `since`; `path` itself when it or anything
 * under it cannot be read, as when it is missing or removed during the
 * walk; or `null`. A link that leads nowhere counts by its own times. A
 * rename, a write and a copy move the status-change time, and no tool sets
 * it back.
 *
 * @param {string} path
 * @param {number} since
 * @param {Set<string>} walked The folders already walked, by device and inode, so a link cycle ends
 * @returns {string | null}
 */
function changedUnder(path, since, walked) {
  try {
    const link = lstatSync(path);
    const stats = followed(path, link);
    const times = [link.mtimeMs, link.ctimeMs, stats.mtimeMs, stats.ctimeMs];
    if (Math.max(...times) > since) return path;
    const id = `${stats.dev}:${stats.ino}`;
    if (!stats.isDirectory() || walked.has(id)) return null;
    walked.add(id);
    for (const name of readdirSync(path)) {
      const changed = changedUnder(join(path, name), since, walked);
      if (changed) return changed;
    }
    return null;
  } catch {
    return path;
  }
}

/**
 * What of the run's build changed after `startedAt`, or `null` when a
 * process started then loaded the build the run has now. It walks every
 * build folder `up` found and every one that exists now. A file or folder
 * renamed, written or copied since counts, whatever modification time it
 * keeps, and so does a build folder that is missing or a path that could
 * not be read during the walk.
 *
 * @param {Build} state The run
 * @param {string} startedAt When the process started, as an ISO time
 * @returns {string | null} What changed since, as `<path> changed` or `<path> is missing`
 */
export function buildChangedSince(state, startedAt) {
  const since = Date.parse(startedAt);
  /** @type {Set<string>} */
  const walked = new Set();
  const roots = new Set([
    ...(state.buildRoots ?? []),
    ...existingBuildRoots(state),
  ]);
  for (const folder of roots) {
    const changed = existsSync(folder)
      ? changedUnder(folder, since, walked)
      : folder;
    if (changed) {
      return `${changed} ${existsSync(changed) ? "changed" : "is missing"}`;
    }
  }
  return null;
}
