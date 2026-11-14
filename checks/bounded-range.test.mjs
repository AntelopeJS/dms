import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import semver from "semver";
import { satisfiesBoundedRange } from "./release-range.mjs";

const SEED = Number(process.env.FC_SEED ?? 20261114);
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

/** Numbers 0 to 2 and 8 to 11, where a decimal-width bug (`9` against `10`) shows. */
const part = fc.oneof(
  fc.integer({ min: 0, max: 2 }),
  fc.integer({ min: 8, max: 11 }),
);
const triple = fc.tuple(part, part, part).map((numbers) => numbers.join("."));
const suffix = fc.option(
  fc.oneof(
    fc
      .tuple(fc.constantFrom("next", "rc"), fc.integer({ min: 0, max: 2 }))
      .map(([tag, id]) => `-${tag}.${id}`),
    fc.constantFrom("+build.0", "+sha.abc123"),
  ),
  { nil: "" },
);

const cases = fc.tuple(triple, triple).chain(([floor, cap]) =>
  fc
    .tuple(
      fc
        .constantFrom(floor, cap)
        .chain((bound) => fc.oneof(fc.constant(bound), triple)),
      suffix,
    )
    .map(([plain, tail]) => ({ floor, cap, version: plain + tail })),
);

await test("membership: the rule agrees with semver.satisfies on every >=A.B.C <D.E.F range, prereleases and build metadata included (catches string comparison, an inclusive cap, an exclusive floor, an ignored major or patch, an admitted prerelease)", () => {
  assertProperty(cases, ({ floor, cap, version }) => {
    const range = `>=${floor} <${cap}`;
    return (
      satisfiesBoundedRange(version, range) === semver.satisfies(version, range)
    );
  });
});

await test("shape: every other spelling of a range is refused, even when semver admits the version (catches a pattern without anchors or one that reads any comparator)", () => {
  const version = "0.4.1";
  const spellings = [
    "^0.4.0",
    "~0.4.0",
    "0.4.x",
    "*",
    ">=0.4.0",
    "<1.0.0",
    ">0.4.0 <1.0.0",
    ">=0.4.0 <=1.0.0",
    ">=0.4.0  <1.0.0",
    ">=0.4.0 <1.0.0 ",
    ">=v0.4.0 <1.0.0",
    ">=0.4.0-0 <1.0.0",
    ">=0.4.0 <1.0.0 || >=2.0.0 <3.0.0",
    ">=0.04.0 <1.0.0",
    "",
    undefined,
  ];
  const accepted = spellings.filter((range) =>
    satisfiesBoundedRange(version, range),
  );
  assert.deepEqual(accepted, []);
});
