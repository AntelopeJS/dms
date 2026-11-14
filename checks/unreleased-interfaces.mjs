import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** @typedef {{ name: string, reason: string }} UnreleasedInterface */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * @param {unknown} value
 * @returns {value is string}
 */
const isString = (value) => typeof value === "string";

/**
 * The value a JSON file holds at a path of own keys.
 *
 * @param {string} path
 * @param {string[]} keys
 * @returns {unknown}
 */
const readField = (path, keys) => {
  /** @type {unknown} */
  const json = JSON.parse(readFileSync(path, "utf8"));
  return keys.reduce((value, key) => {
    if (!isRecord(value)) return undefined;
    /** @type {unknown} */
    const field = Object.getOwnPropertyDescriptor(value, key)?.value;
    return field;
  }, json);
};

/**
 * @param {string} path
 * @param {string[]} keys
 * @returns {string}
 * @throws When the file holds no string at that path.
 */
const readString = (path, keys) => {
  const value = readField(path, keys);
  if (!isString(value)) {
    throw new Error(`${path} has no string at ${keys.join(".")}`);
  }
  return value;
};

/**
 * @param {string} root
 * @param {string[]} args
 * @returns {boolean}
 */
const gitSucceeds = (root, args) => {
  try {
    execFileSync("git", args, { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

/**
 * The workspace interfaces the DMS module depends on whose `src` holds changes
 * no release has published. An interface counts as released at the tag its
 * `.release-it.json` names for the version in the tree; a missing tag means
 * that version was never released from this repository, so its source is
 * unreleased too. Only `src` is compared: a change to the README, tests or
 * tooling of an interface ships nothing a DMS release depends on.
 *
 * The release workflow runs this before any install, so it imports nothing
 * outside Node. The tags must be fetched.
 *
 * @param {string} root The repository root.
 * @returns {UnreleasedInterface[]} One entry per interface a DMS release would run ahead of.
 */
export const unreleasedInterfaces = (root) => {
  const dependencies = readField(join(root, "packages/dms/package.json"), [
    "dependencies",
  ]);
  const dependsOn = (/** @type {string} */ name) =>
    isRecord(dependencies) && Object.hasOwn(dependencies, name);
  return readdirSync(join(root, "packages"))
    .filter((dir) => dir.startsWith("interface-"))
    .map((dir) => {
      const manifest = join(root, "packages", dir, "package.json");
      return {
        dir: `packages/${dir}`,
        name: readString(manifest, ["name"]),
        version: readString(manifest, ["version"]),
        tagName: readString(join(root, "packages", dir, ".release-it.json"), [
          "git",
          "tagName",
        ]),
      };
    })
    .filter(({ name }) => dependsOn(name))
    .flatMap(({ dir, name, version, tagName }) => {
      const tag = tagName.replace("${version}", version);
      if (
        !gitSucceeds(root, [
          "rev-parse",
          "--verify",
          "--quiet",
          `refs/tags/${tag}^{commit}`,
        ])
      ) {
        return [{ name, reason: `no release tag ${tag}` }];
      }
      if (
        !gitSucceeds(root, ["diff", "--quiet", tag, "HEAD", "--", `${dir}/src`])
      ) {
        return [{ name, reason: `${dir}/src changed since ${tag}` }];
      }
      return [];
    });
};
