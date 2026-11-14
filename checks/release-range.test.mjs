import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import semver from "semver";
import { satisfiesImplementedRange } from "./release-range.mjs";

/** @typedef {{ minor: number, patch: number }} Floor */
/** @typedef {{ major: number, minor: number, patch: number, pre?: string, build?: string }} VersionParts */

const SEED = Number(process.env.FC_SEED ?? 20261029);
const NUM_RUNS = 1000;

/**
 * Runs a property with the fixed seed. Rerun with the printed `seed` and
 * `path` in `FC_SEED` to reproduce a failure and its shrinking.
 * @template T
 * @param {fc.Arbitrary<T>} arbitrary
 * @param {(value: T) => boolean | void} predicate
 */
const assertProperty = (arbitrary, predicate) =>
  fc.assert(fc.property(arbitrary, predicate), {
    seed: SEED,
    numRuns: NUM_RUNS,
  });

/**
 * @param {Floor} floor
 * @returns {string}
 */
const canonicalRange = ({ minor, patch }) =>
  `>=0.${minor}.${patch} <0.${minor + 1}.0`;

/**
 * @param {VersionParts} version
 * @returns {string}
 */
const formatVersion = ({ major, minor, patch, pre, build }) =>
  `${major}.${minor}.${patch}${pre === undefined ? "" : `-${pre}`}${build === undefined ? "" : `+${build}`}`;

/**
 * @param {string} version
 * @param {string | undefined} range
 * @returns {boolean}
 */
const rule = (version, range) => satisfiesImplementedRange(version, range);
/**
 * @param {string} version
 * @param {string} range
 * @returns {boolean}
 */
const oracle = (version, range) => semver.satisfies(version, range);
/**
 * @param {string} version
 * @param {string} range
 * @returns {boolean}
 */
const oracleWithPrereleases = (version, range) =>
  semver.satisfies(version, range, { includePrerelease: true });

/**
 * Floors `0.minor.patch` with minor and patch 0 to 4, plus the minors 8 to 11
 * where a decimal-width bug (`0.9.x` against `0.10.0`) shows.
 */
const floors = fc.record({
  minor: fc.oneof(
    fc.integer({ min: 0, max: 4 }),
    fc.integer({ min: 8, max: 11 }),
  ),
  patch: fc.integer({ min: 0, max: 4 }),
});

const prereleases = fc
  .tuple(fc.constantFrom("next", "alpha", "rc"), fc.integer({ min: 0, max: 4 }))
  .map(([tag, id]) => `${tag}.${id}`);
const builds = fc.constantFrom("build.0", "sha.abc123");

/**
 * @param {Floor} floor
 * @param {boolean} suffixes
 */
const versionsAround = (floor, suffixes) =>
  fc.record({
    major: fc.oneof(
      { weight: 8, arbitrary: fc.constant(0) },
      { weight: 1, arbitrary: fc.integer({ min: 1, max: 4 }) },
    ),
    minor: fc.oneof(
      fc.integer({ min: Math.max(0, floor.minor - 1), max: floor.minor + 2 }),
      fc.integer({ min: 0, max: 12 }),
    ),
    patch: fc.oneof(
      fc.integer({ min: Math.max(0, floor.patch - 1), max: floor.patch + 1 }),
      fc.integer({ min: 0, max: 4 }),
    ),
    pre: suffixes
      ? fc.option(prereleases, { nil: undefined })
      : fc.constant(undefined),
    build: suffixes
      ? fc.option(builds, { nil: undefined })
      : fc.constant(undefined),
  });

/** @param {boolean} suffixes */
const cases = (suffixes) =>
  floors.chain((floor) =>
    versionsAround(floor, suffixes).map((version) => ({
      floor,
      range: canonicalRange(floor),
      version,
      text: formatVersion(version),
    })),
  );
const stableCases = cases(false);
const suffixedCases = cases(true);

/** @type {[string, (floor: Floor) => string | undefined][]} */
const mutations = [
  ["canonical", (f) => canonicalRange(f)],
  ["cap skips a minor", (f) => `>=0.${f.minor}.${f.patch} <0.${f.minor + 2}.0`],
  [
    "cap on the floor minor",
    (f) => `>=0.${f.minor}.${f.patch} <0.${f.minor}.9`,
  ],
  ["cap patch", (f) => `>=0.${f.minor}.${f.patch} <0.${f.minor + 1}.1`],
  ["cap inclusive", (f) => `>=0.${f.minor}.${f.patch} <=0.${f.minor + 1}.0`],
  ["floor exclusive", (f) => `>0.${f.minor}.${f.patch} <0.${f.minor + 1}.0`],
  ["major one", (f) => `>=1.${f.minor}.${f.patch} <1.${f.minor + 1}.0`],
  ["cap major one", (f) => `>=0.${f.minor}.${f.patch} <1.${f.minor + 1}.0`],
  ["caret", (f) => `^0.${f.minor}.${f.patch}`],
  ["tilde", (f) => `~0.${f.minor}.${f.patch}`],
  ["exact", (f) => `0.${f.minor}.${f.patch}`],
  ["floor only", (f) => `>=0.${f.minor}.${f.patch}`],
  ["cap only", (f) => `<0.${f.minor + 1}.0`],
  ["two spaces", (f) => `>=0.${f.minor}.${f.patch}  <0.${f.minor + 1}.0`],
  ["tab", (f) => `>=0.${f.minor}.${f.patch}\t<0.${f.minor + 1}.0`],
  ["trailing space", (f) => `${canonicalRange(f)} `],
  ["no space", (f) => `>=0.${f.minor}.${f.patch}<0.${f.minor + 1}.0`],
  ["v prefix", (f) => `>=v0.${f.minor}.${f.patch} <0.${f.minor + 1}.0`],
  ["prerelease cap", (f) => `>=0.${f.minor}.${f.patch} <0.${f.minor + 1}.0-0`],
  [
    "prerelease floor",
    (f) => `>=0.${f.minor}.${f.patch}-0 <0.${f.minor + 1}.0`,
  ],
  ["build floor", (f) => `>=0.${f.minor}.${f.patch}+b <0.${f.minor + 1}.0`],
  ["union", (f) => `${canonicalRange(f)} || >=0.20.0 <0.21.0`],
  ["reversed", (f) => `<0.${f.minor + 1}.0 >=0.${f.minor}.${f.patch}`],
  ["wildcard", (f) => `0.${f.minor}.x`],
  ["star", () => "*"],
  ["empty", () => ""],
  ["missing", () => undefined],
  [
    "leading zero floor minor",
    (f) => `>=0.0${f.minor}.${f.patch} <0.${f.minor + 1}.0`,
  ],
  [
    "leading zero floor patch",
    (f) => `>=0.${f.minor}.0${f.patch} <0.${f.minor + 1}.0`,
  ],
  [
    "leading zero cap minor",
    (f) => `>=0.${f.minor}.${f.patch} <0.0${f.minor + 1}.0`,
  ],
];

const candidates = floors.chain((floor) =>
  fc.constantFrom(...mutations).map(([name, build]) => ({
    floor,
    name,
    range: build(floor),
  })),
);

/**
 * The floor and cap `semver` reads from a range, or undefined when `semver`
 * cannot parse it or it is anything but one `>=` and one `<` comparator on
 * plain `0.minor.patch` and `0.(minor+1).0` versions. `semver` drops a `>=0.0.0`
 * floor, so a lone `<0.1.0` stands for the floor `0.0.0`.
 * @param {string | undefined} range
 * @returns {Floor | undefined}
 */
const semverFloor = (range) => {
  if (range === undefined) return undefined;
  /** @type {readonly import("semver").Comparator[]} */
  let comparators;
  try {
    const { set } = new semver.Range(range);
    if (set.length !== 1) return undefined;
    comparators = set[0];
  } catch {
    return undefined;
  }
  const [lower, upper] =
    comparators.length === 1
      ? [new semver.Comparator(">=0.0.0"), comparators[0]]
      : comparators;
  if (comparators.length > 2 || upper === undefined) return undefined;
  /**
   * @param {import("semver").Comparator} c
   * @returns {boolean}
   */
  const plain = (c) =>
    c.semver.prerelease.length === 0 && c.semver.build.length === 0;
  if (lower.operator !== ">=" || upper.operator !== "<") return undefined;
  if (!plain(lower) || !plain(upper) || lower.semver.major !== 0)
    return undefined;
  if (upper.semver.major !== 0 || upper.semver.patch !== 0) return undefined;
  if (upper.semver.minor !== lower.semver.minor + 1) return undefined;
  return { minor: lower.semver.minor, patch: lower.semver.patch };
};

/**
 * @param {{ floor: Floor, range: string | undefined }} input
 * @returns {boolean}
 */
const acceptsOnlyCanonical = ({ floor, range }) => {
  const parsed = semverFloor(range);
  const probe = `0.${(parsed ?? floor).minor}.${(parsed ?? floor).patch}`;
  return (
    rule(probe, range) ===
    (parsed !== undefined && range === canonicalRange(parsed))
  );
};
await test("range: the rule accepts exactly the canonical >=0.M.p <0.(M+1).0 range semver parses (catches a cap that is not the next minor, a loose operator, a union or a leading zero)", () => {
  assertProperty(candidates, acceptsOnlyCanonical);
});

await test("range: a leading zero in the floor or cap is rejected like semver rejects the range", () => {
  for (const range of [
    ">=0.09.1 <0.10.0",
    ">=0.9.01 <0.10.0",
    ">=0.9.1 <0.010.0",
  ]) {
    assert.equal(semver.validRange(range), null);
    assert.equal(rule("0.9.1", range), false);
  }
});

await test("membership: stable versions agree with semver.satisfies on every canonical range (catches string comparison, an inclusive cap, an exclusive floor, a missing patch compare)", () => {
  assertProperty(
    stableCases,
    ({ range, text }) => rule(text, range) === oracle(text, range),
  );
});

await test("cap: no version of the next minor or any later release is accepted, prereleases included (catches ordering a prerelease below its release)", () => {
  assertProperty(
    suffixedCases.filter(
      ({ floor, version }) => version.major > 0 || version.minor > floor.minor,
    ),
    ({ range, text }) => rule(text, range) === false,
  );
});

await test("prerelease and build metadata: the rule agrees with semver.satisfies (catches a dropped prerelease or a build suffix read as part of the patch)", () => {
  assertProperty(
    suffixedCases,
    ({ range, text }) => rule(text, range) === oracle(text, range),
  );
});

await test("malformed versions: the rule agrees with semver.satisfies (catches a leading zero, an empty or foreign build suffix, or no length cap in the version)", () => {
  const range = ">=0.9.1 <0.10.0";
  for (const version of [
    "0.09.5",
    "00.9.5",
    "0.9.05",
    "0.9.5+",
    "0.9.5+a_b",
    "0.9.5+a..b",
    "0.9.5-",
    "0.9.5+build-1.x",
    `0.9.5+${"a".repeat(250)}`,
    `0.9.5+${"a".repeat(251)}`,
  ]) {
    assert.equal(rule(version, range), oracle(version, range), version);
  }
});

await test("oracle choice: only the default options state the promise, includePrerelease admits the breaking minor's prerelease", () => {
  const range = ">=0.9.1 <0.10.0";
  const observed = [
    "0.9.1",
    "0.9.5",
    "0.10.0",
    "0.9.1-next.0",
    "0.9.5-rc.1",
    "0.10.0-next.0",
    "0.9.5+build.0",
  ].map((version) => [
    version,
    rule(version, range),
    oracle(version, range),
    oracleWithPrereleases(version, range),
  ]);
  assert.deepEqual(observed, [
    ["0.9.1", true, true, true],
    ["0.9.5", true, true, true],
    ["0.10.0", false, false, false],
    ["0.9.1-next.0", false, false, false],
    ["0.9.5-rc.1", false, false, true],
    ["0.10.0-next.0", false, false, true],
    ["0.9.5+build.0", true, true, true],
  ]);
});
