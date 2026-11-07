import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isBoolean, isNumber, isString, objectOf } from "./json.mjs";

/**
 * @typedef {{ feature?: string, journey?: string, step?: string, command?: string, action?: string, check?: string }} TimingDetail What a phase names besides its own name
 * @typedef {{ phase: string, ms: number, startedAt: string, ok: boolean } & TimingDetail} TimingEntry One measured phase, as `timings.jsonl` holds it
 * @typedef {{ name: string, count: number, totalMs: number, medianMs: number, maxMs: number }} TimingRow
 * @typedef {{ rows: TimingRow[], totalMs: number }} TimingSummary
 */

/** The file of a run's evidence that every process appends its phases to, one JSON object per line. */
export const TIMINGS_FILE = "timings.jsonl";

const MS_PER_SECOND = 1000;
const TOP_LEVEL = new Set(["prepare", "up", "journey", "formal"]);

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

/**
 * @param {TimingEntry} entry An entry
 * @returns {string} Its row name: the phase, or for a journey `journey <feature>/<id>`
 */
function rowName(entry) {
  return entry.phase === "journey" && entry.feature && entry.journey
    ? `journey ${entry.feature}/${entry.journey}`
    : entry.phase;
}

/**
 * @param {number[]} sorted Durations, ascending and not empty
 * @returns {number} Their median, the mean of the two middle ones when the count is even
 */
function median(sorted) {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * One row per phase name, a journey counting under its own name, ordered by
 * when the phase first started, and the total: the sum of the top-level
 * phases (`prepare`, `up`, each `journey`, `formal`), which contain the others.
 *
 * @param {TimingEntry[]} entries The entries of a run
 * @returns {TimingSummary} The rows and the total
 */
export function summarize(entries) {
  /** @type {Map<string, TimingEntry[]>} */
  const groups = new Map();
  for (const entry of entries) {
    const name = rowName(entry);
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  /** @type {(group: TimingEntry[]) => string} */
  const firstStart = (group) => group.map((entry) => entry.startedAt).sort()[0];
  const rows = [...groups]
    .sort(([, a], [, b]) => firstStart(a).localeCompare(firstStart(b)))
    .map(([name, group]) => {
      const durations = group.map((entry) => entry.ms).sort((a, b) => a - b);
      return {
        name,
        count: group.length,
        totalMs: durations.reduce((sum, ms) => sum + ms, 0),
        medianMs: median(durations),
        maxMs: durations[durations.length - 1],
      };
    });
  const totalMs = entries
    .filter((entry) => TOP_LEVEL.has(entry.phase))
    .reduce((sum, entry) => sum + entry.ms, 0);
  return { rows, totalMs };
}

/**
 * @param {number} ms A duration
 * @returns {string} It in seconds with one decimal
 */
export function formatSeconds(ms) {
  return (ms / MS_PER_SECOND).toFixed(1);
}

/**
 * @param {TimingSummary} summary The summary
 * @returns {string[][]} The header, a row per phase and the total, as cells
 */
function cellsOf(summary) {
  return [
    ["phase", "count", "total s", "median ms", "max ms"],
    ...summary.rows.map((row) => [
      row.name,
      String(row.count),
      formatSeconds(row.totalMs),
      String(row.medianMs),
      String(row.maxMs),
    ]),
    ["total", "", formatSeconds(summary.totalMs), "", ""],
  ];
}

/**
 * The summary as the plain table `dms-control timings` prints.
 *
 * @param {TimingSummary} summary The summary
 * @returns {string} The table
 */
export function formatTimings(summary) {
  const cells = cellsOf(summary);
  const widths = cells[0].map((_, column) =>
    Math.max(...cells.map((row) => row[column].length)),
  );
  return cells
    .map((row) =>
      row
        .map((cell, column) =>
          column === 0
            ? cell.padEnd(widths[column])
            : cell.padStart(widths[column]),
        )
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}

/**
 * The summary as the Markdown table of the verdict's Timing section.
 *
 * @param {TimingSummary} summary The summary
 * @returns {string[]} The lines of the table
 */
export function markdownTimings(summary) {
  const [header, ...body] = cellsOf(summary);
  return [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];
}
