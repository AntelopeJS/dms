/**
 * The first three dot-separated fields of a version, read as numbers. The
 * prerelease suffix is dropped and build metadata is not, so a patch field that
 * carries `+build` reads as `NaN`.
 */
const compare = (a, b) => {
  const parts = (v) => v.split("-")[0].split(".").map(Number);
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/**
 * Whether the interface version sitting in the tree satisfies the range the
 * module publishes for it. The module implements the interface, so the range
 * must cap it below the next minor (`>=0.M.p <0.(M+1).0`): a breaking interface
 * minor must never reach a DMS that does not implement it. A floor that lags the
 * tree only widens what consumers may install, so the version has to satisfy the
 * range, not equal its floor.
 *
 * The release workflow runs this before any install, so it imports nothing.
 *
 * @param {string} version The `version` of the interface package in the tree.
 * @param {string | undefined} range The module's dependency range on it.
 * @returns {boolean} True when the range has the implemented shape and admits the version.
 */
export const satisfiesImplementedRange = (version, range) => {
  const match = /^>=(0\.(\d+)\.\d+) <(0\.(\d+)\.0)$/.exec(range ?? "");
  if (!match || Number(match[4]) !== Number(match[2]) + 1) return false;
  return compare(version, match[1]) >= 0 && compare(version, match[3]) < 0;
};
