import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decode, isNumber, recordOf } from "../packages/dms/e2e/json.mjs";

/**
 * @typedef {import("@playwright/test/reporter").Reporter} Reporter
 * @typedef {import("@playwright/test/reporter").FullConfig} FullConfig
 * @typedef {import("@playwright/test/reporter").Suite} Suite
 * @typedef {import("@playwright/test/reporter").TestCase} TestCase
 * @typedef {import("@playwright/test/reporter").TestResult} TestResult
 * @typedef {import("@playwright/test/reporter").TestRun} TestRun
 */

const WEIGHTS = fileURLToPath(new URL("./test-weights.json", import.meta.url));

/**
 * The key of a test in `test-weights.json`: its file, describe blocks and
 * title, joined by ` › `.
 *
 * @param {TestCase} test The test
 * @returns {string}
 */
export function weightKey(test) {
  return test.titlePath().slice(2).join(" › ");
}

/**
 * The shard (1-based) of each of `seconds`, in order: the suite cut into
 * `count` contiguous runs of about equal seconds, each test in the run that
 * holds its midpoint. A test with no seconds counts as the median of the
 * known ones, or 1 when none is known.
 *
 * @param {(number | undefined)[]} seconds The seconds of each test, in the suite's order
 * @param {number} count How many shards
 * @returns {number[]}
 */
export function contiguousShards(seconds, count) {
  const known = seconds
    .filter((value) => value !== undefined)
    .sort((left, right) => left - right);
  const middle = Math.floor(known.length / 2);
  const fallback =
    known.length === 0
      ? 1
      : known.length % 2 === 1
        ? known[middle]
        : (known[middle - 1] + known[middle]) / 2;
  const weights = seconds.map((value) => value ?? fallback);
  const total = weights.reduce((sum, value) => sum + value, 0);
  let elapsed = 0;
  return weights.map((weight) => {
    const midpoint = elapsed + weight / 2;
    elapsed += weight;
    return Math.min(count, Math.floor((midpoint * count) / total) + 1);
  });
}

/**
 * Replaces Playwright's `--shard`, which cuts the suite into contiguous runs
 * of equal count, with `contiguousShards`' runs of equal seconds by
 * `test-weights.json`. The journeys of a shard share one dms run, so a shard
 * stays a contiguous run of the suite's order, as with `--shard`. With
 * `DMS_E2E_DURATIONS` set to a path, it writes there the seconds each test of
 * the run took, which `refresh-test-weights.mjs e2e` averages into the weights.
 *
 * @implements {Reporter}
 */
export default class WeightedShards {
  /** @type {Map<string, number>} */
  #seconds = new Map();

  /**
   * @param {{ config: FullConfig, suite: Suite, testRun: TestRun }} params The run before it starts
   * @returns {Promise<void>}
   */
  async preprocess({ config, suite, testRun }) {
    if (!config.shard) return;
    testRun.skipSharding();
    const weights = decode(
      recordOf(isNumber),
      JSON.parse(readFileSync(WEIGHTS, "utf8")),
      WEIGHTS,
      "seconds per test",
    );
    const tests = suite.allTests();
    const shards = contiguousShards(
      tests.map((test) => weights[weightKey(test)]),
      config.shard.total,
    );
    for (const [index, test] of tests.entries()) {
      if (shards[index] !== config.shard.current) testRun.exclude(test);
    }
  }

  /**
   * @param {TestCase} test The test
   * @param {TestResult} result Its result
   */
  onTestEnd(test, result) {
    this.#seconds.set(weightKey(test), result.duration / 1000);
  }

  onEnd() {
    const output = process.env["DMS_E2E_DURATIONS"];
    if (!output) return;
    const seconds = Object.fromEntries(
      [...this.#seconds].sort(([left], [right]) => (left < right ? -1 : 1)),
    );
    writeFileSync(output, `${JSON.stringify(seconds, null, 2)}\n`);
  }

  printsToStdio() {
    return false;
  }
}
