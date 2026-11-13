import { satisfiesImplementedRange } from "./release-range.mjs";

const NUMBER = String.raw`(0|[1-9]\d*)`;
const PLAIN_RELEASE = new RegExp(String.raw`^${NUMBER}\.${NUMBER}\.${NUMBER}$`);
const DMS_DEPENDENCY = /("@antelopejs\/interface-dms":\s*")([^"]*)(")/g;

/**
 * The range the DMS module must publish once the interface version in the tree
 * falls outside the one it has: the canonical `>=0.M.p <0.(M+1).0` with the
 * bumped version as its floor. A range that already satisfies
 * `satisfiesImplementedRange` stays as it is, even when its floor lags the
 * version.
 *
 * The rule only covers the 0.x line, so a major of 1 or more is refused rather
 * than given a range the release workflow would reject. A prerelease or a
 * version with build metadata is refused too: no canonical range admits a
 * prerelease. The written range is checked against the same rule before it is
 * returned.
 *
 * @param {string} version The bumped `version` of the interface package.
 * @param {string | undefined} range The module's current dependency range on it.
 * @returns {string | undefined} The range to write, or undefined when none is needed.
 * @throws {Error} When the version has no canonical range to raise to.
 */
export const raisedDmsRange = (version, range) => {
  if (satisfiesImplementedRange(version, range)) return undefined;
  const release = PLAIN_RELEASE.exec(version);
  if (!release) {
    throw new Error(
      `Cannot raise the DMS range for "${version}": only a plain 0.M.p release has a canonical range`,
    );
  }
  const [, major, minor, patch] = release;
  if (major !== "0") {
    throw new Error(
      `Cannot raise the DMS range for ${version}: the release rule only covers 0.x`,
    );
  }
  const raised = `>=0.${minor}.${patch} <0.${Number(minor) + 1}.0`;
  if (!satisfiesImplementedRange(version, raised)) {
    throw new Error(
      `Cannot raise the DMS range for ${version}: "${raised}" fails the release rule`,
    );
  }
  return raised;
};

/**
 * Rewrites the `@antelopejs/interface-dms` dependency of a module manifest and
 * nothing else, so the file keeps its formatting.
 *
 * @param {string} manifest The text of the module's `package.json`.
 * @param {string} range The range to write.
 * @returns {string} The manifest text with the new range.
 * @throws {Error} When the manifest does not declare the dependency exactly once.
 */
export const withDmsRange = (manifest, range) => {
  const matches = [...manifest.matchAll(DMS_DEPENDENCY)];
  if (matches.length !== 1) {
    throw new Error(
      `Expected one "@antelopejs/interface-dms" dependency, found ${matches.length}`,
    );
  }
  return manifest.replace(
    DMS_DEPENDENCY,
    (_, head, __, tail) => `${head}${range}${tail}`,
  );
};
