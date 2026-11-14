const MAX_VERSION_LENGTH = 256;
const NUMBER = String.raw`(0|[1-9]\d*)`;
const TRIPLE = String.raw`${NUMBER}\.${NUMBER}\.${NUMBER}`;
const BOUNDED = new RegExp(String.raw`^>=${TRIPLE} <${TRIPLE}$`);
const RELEASE = new RegExp(
  String.raw`^${TRIPLE}(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$`,
);

/**
 * @param {readonly number[]} left
 * @param {readonly number[]} right
 * @returns {number} Negative, zero or positive as `left` sorts before, with or after `right`.
 */
const compare = (left, right) =>
  left.map((part, index) => part - (right[index] ?? 0)).find((d) => d !== 0) ??
  0;

/**
 * The floor and cap of a `>=A.B.C <D.E.F` range, or undefined for any other
 * spelling.
 *
 * @param {string | undefined} range
 * @returns {{ floor: number[], cap: number[] } | undefined}
 */
const parseBounded = (range) => {
  const bounds = BOUNDED.exec(range ?? "");
  if (!bounds) return undefined;
  const numbers = bounds.slice(1).map(Number);
  return { floor: numbers.slice(0, 3), cap: numbers.slice(3) };
};

/**
 * The `major.minor.patch` of a release version, or undefined for a prerelease,
 * a number with a leading zero or a version longer than 256 characters.
 *
 * @param {string} version
 * @returns {number[] | undefined}
 */
const parseRelease = (version) => {
  const release =
    version.length <= MAX_VERSION_LENGTH ? RELEASE.exec(version) : null;
  return release ? release.slice(1).map(Number) : undefined;
};

/**
 * Whether a version in the tree satisfies a `>=A.B.C <D.E.F` dependency range,
 * as `semver.satisfies` with default options decides. Any other spelling of
 * the range is refused, so the release stops rather than trust a range this
 * check cannot read.
 *
 * Neither bound carries a prerelease, so `semver` admits no prerelease version,
 * and it ignores build metadata. A number with a leading zero is not semver, in
 * the range or in the version, and `semver` refuses a version longer than 256
 * characters.
 *
 * The release workflow runs this before any install, so it imports nothing.
 *
 * @param {string} version The `version` of the package in the tree.
 * @param {string | undefined} range The module's dependency range on it.
 * @returns {boolean} True when the range has the bounded shape and admits the version.
 */
export const satisfiesBoundedRange = (version, range) => {
  const bounds = parseBounded(range);
  const release = parseRelease(version);
  if (!bounds || !release) return false;
  return (
    compare(release, bounds.floor) >= 0 && compare(release, bounds.cap) < 0
  );
};

/**
 * Whether the interface version sitting in the tree satisfies the range the
 * module publishes for it, as `semver.satisfies` with default options decides.
 * The module implements the interface, so the range must cap it below the next
 * minor (`>=0.M.p <0.(M+1).0`): a breaking interface minor must never reach a
 * DMS that does not implement it. A floor that lags the tree only widens what
 * consumers may install, so the version has to satisfy the range, not equal its
 * floor.
 *
 * @param {string} version The `version` of the interface package in the tree.
 * @param {string | undefined} range The module's dependency range on it.
 * @returns {boolean} True when the range has the implemented shape and admits the version.
 */
export const satisfiesImplementedRange = (version, range) => {
  const bounds = parseBounded(range);
  if (!bounds) return false;
  const [, floorMinor] = bounds.floor;
  const [capMajor, capMinor, capPatch] = bounds.cap;
  return (
    capMajor === 0 &&
    capMinor === floorMinor + 1 &&
    capPatch === 0 &&
    satisfiesBoundedRange(version, range)
  );
};
