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
 * known ones, or 1 when none is known. Shard 1 starts with `headStart`
 * seconds of other work; when that is its whole share, it takes no test and
 * the others split the suite.
 *
 * @param {(number | undefined)[]} seconds The seconds of each test, in the suite's order
 * @param {number} count How many shards
 * @param {number} [headStart] The seconds shard 1 spends on other work
 * @returns {number[]}
 */
export function contiguousShards(seconds, count, headStart = 0) {
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
  const total = weights.reduce((sum, value) => sum + value, headStart);
  if (count > 1 && headStart * count >= total) {
    return contiguousShards(seconds, count - 1).map((shard) => shard + 1);
  }
  let elapsed = headStart;
  return weights.map((weight) => {
    const midpoint = elapsed + weight / 2;
    elapsed += weight;
    return Math.min(count, Math.floor((midpoint * count) / total) + 1);
  });
}

/** @returns {number} The seconds of `DMS_E2E_FIRST_SHARD_EXTRA`, 0 when unset */
function firstShardExtra() {
  const value = process.env["DMS_E2E_FIRST_SHARD_EXTRA"];
  if (value === undefined) return 0;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(
      `DMS_E2E_FIRST_SHARD_EXTRA is ${JSON.stringify(value)}, not a count of seconds`,
    );
  }
  return seconds;
}

/**
 * Replaces Playwright's `--shard`, which cuts the suite into contiguous runs
 * of equal count, with `contiguousShards`' runs of equal seconds by
 * `test-weights.json`. The workers of a shard take its journeys in the
 * suite's order, so a shard stays a contiguous run of that order, as with
 * `--shard`. `DMS_E2E_FIRST_SHARD_EXTRA` is the wall-clock seconds shard 1
 * spends after the suite, which its workers would have spent on journeys.
 * With
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
      firstShardExtra() * config.workers,
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
