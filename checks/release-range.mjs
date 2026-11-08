const MAX_VERSION_LENGTH = 256;
const NUMBER = String.raw`(0|[1-9]\d*)`;
const RANGE = new RegExp(
  String.raw`^>=0\.${NUMBER}\.${NUMBER} <0\.${NUMBER}\.0$`,
);
const RELEASE = new RegExp(
  String.raw`^${NUMBER}\.${NUMBER}\.${NUMBER}(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`,
);

/**
 * Whether the interface version sitting in the tree satisfies the range the
 * module publishes for it, as `semver.satisfies` with default options decides.
 * The module implements the interface, so the range must cap it below the next
 * minor (`>=0.M.p <0.(M+1).0`): a breaking interface minor must never reach a
 * DMS that does not implement it. A floor that lags the tree only widens what
 * consumers may install, so the version has to satisfy the range, not equal its
 * floor.
 *
 * Neither bound carries a prerelease, so `semver` admits no prerelease version,
 * and it ignores build metadata. A number with a leading zero is not semver, in
 * the range or in the version, and `semver` refuses a version longer than 256
 * characters.
 *
 * The release workflow runs this before any install, so it imports nothing.
 *
 * @param {string} version The `version` of the interface package in the tree.
 * @param {string | undefined} range The module's dependency range on it.
 * @returns {boolean} True when the range has the implemented shape and admits the version.
 */
export const satisfiesImplementedRange = (version, range) => {
  const bounds = RANGE.exec(range ?? "");
  const release =
    version.length <= MAX_VERSION_LENGTH ? RELEASE.exec(version) : null;
  if (!bounds || !release) return false;
  const [floorMinor, floorPatch, capMinor] = bounds.slice(1).map(Number);
  const [major, minor, patch] = release.slice(1).map(Number);
  return (
    capMinor === floorMinor + 1 &&
    major === 0 &&
    minor === floorMinor &&
    patch >= floorPatch
  );
};
