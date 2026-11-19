import assert from "node:assert/strict";
import recorded from "./test-weights.json" with { type: "json" };
import { test } from "node:test";
import { decode, isNumber, recordOf } from "../packages/dms/e2e/json.mjs";
import WeightedShards from "./weighted-shards.mjs";

const WEIGHTS = decode(
  recordOf(isNumber),
  recorded,
  "e2e/test-weights.json",
  "seconds per test",
);

/**
 * @param {string} key A `test-weights.json` key
 * @returns {{ titlePath: () => string[] }}
 */
function testCase(key) {
  return { titlePath: () => ["", "chromium", ...key.split(" › ")] };
}

/**
 * Runs `preprocess` on `tests` as shard `current` of `total`.
 *
 * @param {ReturnType<typeof testCase>[]} tests The suite's tests
 * @param {{ current: number, total: number } | null} shard The shard
 * @returns {Promise<{ kept: ReturnType<typeof testCase>[], skippedSharding: boolean }>}
 */
async function preprocess(tests, shard) {
  const excluded = new Set();
  let skippedSharding = false;
  await new WeightedShards().preprocess(
    {
      config: { shard },
      suite: { allTests: () => tests },
      testRun: {
        skipSharding: () => {
          skippedSharding = true;
        },
        exclude: (/** @type {unknown} */ excludedTest) => {
          excluded.add(excludedTest);
        },
      },
    },
  );
  return { kept: tests.filter((t) => !excluded.has(t)), skippedSharding };
}

await test("keeps every test and Playwright's sharding off a run without --shard, so the @smoke run is whole", async () => {
  const tests = Object.keys(WEIGHTS).map(testCase);
  const { kept, skippedSharding } = await preprocess(tests, null);
  assert.equal(kept.length, tests.length);
  assert.equal(skippedSharding, false);
});

await test("cuts the suite into contiguous shards that together hold every test once, an unweighted one included, so no journey is dropped, run twice or run after journeys it never followed", async () => {
  const tests = [...Object.keys(WEIGHTS), "new.spec.ts › feature › added"].map(
    testCase,
  );
  const shards = await Promise.all(
    [1, 2, 3, 4, 5].map((current) => preprocess(tests, { current, total: 5 })),
  );
  assert.ok(shards.every(({ skippedSharding }) => skippedSharding));
  assert.deepEqual(
    shards.flatMap(({ kept }) => kept),
    tests,
  );
});

await test("splits by the weights rather than by count, so the slowest shard of the recorded suite is within 5% of the mean", async () => {
  const tests = Object.keys(WEIGHTS).map(testCase);
  const total = 3;
  const loads = await Promise.all(
    Array.from({ length: total }, async (_, index) => {
      const { kept } = await preprocess(tests, { current: index + 1, total });
      return kept.reduce(
        (sum, t) => sum + WEIGHTS[t.titlePath().slice(2).join(" › ")],
        0,
      );
    }),
  );
  const mean = loads.reduce((sum, load) => sum + load, 0) / total;
  assert.ok(
    Math.max(...loads) <= mean * 1.05,
    `loads ${loads.join(", ")} around a mean of ${mean}`,
  );
});
