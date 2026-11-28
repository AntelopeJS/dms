import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readTimings } from "../packages/dms/e2e/timing.mjs";

/**
 * @typedef {import("../packages/dms/e2e/timing.mjs").TimingEntry} TimingEntry
 */

/**
 * The value at `fraction` of sorted `values`, nearest rank.
 *
 * @param {number[]} values Sorted ascending, not empty
 * @param {number} fraction Between 0 and 1
 * @returns {number}
 */
function quantile(values, fraction) {
  const rank = Math.ceil(fraction * values.length) - 1;
  return values[Math.min(values.length - 1, Math.max(0, rank))];
}

/**
 * One line per phase of `entries`, in the order each phase first appears:
 * its count and its total, median, 95th percentile and longest
 * milliseconds.
 *
 * @param {TimingEntry[]} entries The phases a run recorded
 * @returns {string[]}
 */
function phaseLines(entries) {
  /** @type {Map<string, number[]>} */
  const byPhase = new Map();
  for (const entry of entries) {
    byPhase.set(entry.phase, [...(byPhase.get(entry.phase) ?? []), entry.ms]);
  }
  return [...byPhase].map(([phase, values]) => {
    const sorted = values.toSorted((left, right) => left - right);
    const total = sorted.reduce((sum, value) => sum + value, 0);
    return `${phase}: n=${sorted.length} sum=${total} p50=${quantile(sorted, 0.5)} p95=${quantile(sorted, 0.95)} max=${sorted.at(-1)}`;
  });
}

/**
 * Prints, as one GitHub Actions notice, the phase timings of every run in
 * the runs folder `process.argv[2]`, so a reader of the check run's
 * annotations sees where a shard's time went. Prints nothing when no run
 * started.
 */
function main() {
  const runs = process.argv[2];
  if (!runs) throw new Error("usage: timings-summary.mjs <runs folder>");
  if (!existsSync(runs)) return;
  const entries = readdirSync(runs).flatMap((run) =>
    readTimings(join(runs, run, "evidence")),
  );
  const message = phaseLines(entries).join("%0A");
  process.stdout.write(`::notice title=dms e2e timings (ms)::${message}\n`);
}

if (import.meta.main) main();
