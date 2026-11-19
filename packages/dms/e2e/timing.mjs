import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isBoolean, isNumber, isString, objectOf } from "./json.mjs";

/**
 * @typedef {{ feature?: string, journey?: string, step?: string, command?: string, action?: string, check?: string }} TimingDetail What a phase names besides its own name
 * @typedef {{ phase: string, ms: number, startedAt: string, ok: boolean } & TimingDetail} TimingEntry One measured phase, as `timings.jsonl` holds it
 */

/** The file of a run's evidence that every process appends its phases to, one JSON object per line. */
export const TIMINGS_FILE = "timings.jsonl";

const isTimingEntry = objectOf(
  { phase: isString, ms: isNumber, startedAt: isString, ok: isBoolean },
  {
    feature: isString,
    journey: isString,
    step: isString,
    command: isString,
    action: isString,
    check: isString,
  },
);

/**
 * Starts a clock.
 *
 * @returns {() => { ms: number, startedAt: string }} A function that reads the whole milliseconds elapsed and when the clock started
 */
export function stopwatch() {
  const startedAt = new Date().toISOString();
  const began = performance.now();
  return () => ({ ms: Math.round(performance.now() - began), startedAt });
}

/**
 * Appends one entry to the run's `timings.jsonl`. Separate processes append
 * to it, so no write reads the file first.
 *
 * @param {{ evidence: string }} state The run
 * @param {TimingEntry} entry The entry
 */
export function appendTiming(state, entry) {
  appendFileSync(
    join(state.evidence, TIMINGS_FILE),
    `${JSON.stringify(entry)}\n`,
  );
}

/**
 * Appends the entry of a phase that was measured with {@link stopwatch}.
 *
 * @param {{ evidence: string }} state The run
 * @param {string} phase The phase name
 * @param {{ ms: number, startedAt: string }} lap What the stopwatch read
 * @param {boolean} ok Whether the phase succeeded
 * @param {TimingDetail} [detail] What the phase names
 */
export function recordTiming(state, phase, lap, ok, detail = {}) {
  appendTiming(state, {
    phase,
    ms: lap.ms,
    startedAt: lap.startedAt,
    ok,
    ...detail,
  });
}

/**
 * Runs `action` and records how long it took, also when it throws (then with
 * `ok: false`, and the error is rethrown).
 *
 * @template T
 * @param {{ evidence: string }} state The run
 * @param {string} phase The phase name
 * @param {() => T | Promise<T>} action What to measure
 * @param {TimingDetail} [detail] What the phase names
 * @returns {Promise<T>} What `action` returned
 */
export async function timed(state, phase, action, detail) {
  const stop = stopwatch();
  let ok = false;
  try {
    const result = await action();
    ok = true;
    return result;
  } finally {
    recordTiming(state, phase, stop(), ok, detail);
  }
}

/**
 * @param {string} line A line of `timings.jsonl`
 * @returns {TimingEntry[]} The entry, none for a line that holds no entry
 */
function entryOf(line) {
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(line);
    return isTimingEntry(parsed) ? [parsed] : [];
  } catch {
    return [];
  }
}

/**
 * The entries a run recorded, in the order they were written. A run with no
 * `timings.jsonl`, and any line that is no entry, give none.
 *
 * @param {string} evidence The run's evidence folder
 * @returns {TimingEntry[]} The entries
 */
export function readTimings(evidence) {
  const file = join(evidence, TIMINGS_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").flatMap(entryOf);
}
