import {
  END_OF_DAY_HOURS,
  END_OF_DAY_MINUTES,
  END_OF_DAY_MS,
  END_OF_DAY_SECONDS,
  type PeriodComparison,
  type PeriodPreset,
  type PeriodRange,
} from "#dms-core/app/composables/period/types";

/** The range half of a selector's choice: a preset, or a custom range. */
export interface PeriodRangeChoice {
  preset: PeriodPreset;
  customRange: PeriodRange | null;
}

/** The comparison half of a selector's choice. */
export interface PeriodComparisonChoice {
  comparison: PeriodComparison;
  customCompareRange: PeriodRange | null;
}

/** What a selector keeps in the URL and in the user's preferences. */
export interface PeriodSelection
  extends PeriodRangeChoice,
    PeriodComparisonChoice {}

/** The menus a selection has to fit in. */
export interface PeriodChoices {
  presets: readonly PeriodPreset[];
  comparisons: readonly PeriodComparison[];
}

/** A page URL query, or a selection kept in the preferences. */
export type PeriodQuery = Record<string, unknown>;

/** The keys one selector reads and writes. */
export interface PeriodQueryKeys {
  period: string;
  compare: string;
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
}

/** A source the halves of a selection are read from, in order. */
export interface PeriodSource {
  query: PeriodQuery;
  keys: PeriodQueryKeys;
}

const CUSTOM_PRESET: PeriodPreset = "custom";
const CUSTOM_COMPARISON: PeriodComparison = "custom";
const KEY_NAMES: Array<keyof PeriodQueryKeys> = [
  "period",
  "compare",
  "from",
  "to",
  "compareFrom",
  "compareTo",
];
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MONTH_OFFSET = 1;
const DATE_PART_LENGTH = 2;
const YEAR_PART_LENGTH = 4;

/**
 * The keys of selector `id` in the page URL (`<id>.period`), or the bare keys
 * (`period`) of a selection kept on its own.
 */
export function periodQueryKeys(id?: string): PeriodQueryKeys {
  const prefix = id ? `${id}.` : "";
  return Object.fromEntries(
    KEY_NAMES.map((name) => [name, `${prefix}${name}`]),
  ) as unknown as PeriodQueryKeys;
}

function readText(query: PeriodQuery, key: string): string | undefined {
  const raw = query[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value ? value : undefined;
}

type DayBoundary = "start" | "end";

function dayBoundary(day: Date, boundary: DayBoundary): Date {
  if (boundary === "end") {
    day.setHours(
      END_OF_DAY_HOURS,
      END_OF_DAY_MINUTES,
      END_OF_DAY_SECONDS,
      END_OF_DAY_MS,
    );
  }
  return day;
}

/** A local calendar day, refused when it does not exist (`2026-02-30`). */
function parseIsoDay(match: RegExpExecArray, boundary: DayBoundary) {
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year!, month! - MONTH_OFFSET, day);
  const exists =
    date.getFullYear() === year &&
    date.getMonth() === month! - MONTH_OFFSET &&
    date.getDate() === day;
  return exists ? dayBoundary(date, boundary) : null;
}

/**
 * A bound read from the URL: an ISO date is the start (`from`) or the end
 * (`to`) of that local day, an ISO date-time is that instant. Anything else
 * is `null`.
 */
export function parsePeriodDate(
  text: string | undefined,
  boundary: DayBoundary,
): Date | null {
  if (!text) return null;
  const day = ISO_DATE.exec(text);
  if (day) return parseIsoDay(day, boundary);
  if (!ISO_DATE_TIME.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number, length = DATE_PART_LENGTH): string {
  return String(value).padStart(length, "0");
}

function isDayBoundary(date: Date, boundary: DayBoundary): boolean {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return dayBoundary(day, boundary).getTime() === date.getTime();
}

/**
 * A bound as the URL writes it: the bare local day when it falls on that
 * day's boundary (a range picked in the calendar), the ISO instant otherwise.
 */
export function formatPeriodDate(date: Date, boundary: DayBoundary): string {
  if (!isDayBoundary(date, boundary)) return date.toISOString();
  return [
    pad(date.getFullYear(), YEAR_PART_LENGTH),
    pad(date.getMonth() + MONTH_OFFSET),
    pad(date.getDate()),
  ].join("-");
}

function readRange(
  query: PeriodQuery,
  fromKey: string,
  toKey: string,
): PeriodRange | null {
  const from = parsePeriodDate(readText(query, fromKey), "start");
  const to = parsePeriodDate(readText(query, toKey), "end");
  if (!from || !to || from.getTime() > to.getTime()) return null;
  return { from, to };
}

/**
 * The range a source names, when the selector offers it: a custom range
 * (`from` and `to`) first, then a preset (`period`).
 */
export function readRangeChoice(
  source: PeriodSource,
  choices: PeriodChoices,
): PeriodRangeChoice | null {
  const { query, keys } = source;
  const customRange = readRange(query, keys.from, keys.to);
  if (customRange && choices.presets.includes(CUSTOM_PRESET)) {
    return { preset: CUSTOM_PRESET, customRange };
  }
  const preset = choices.presets.find(
    (entry) => entry === readText(query, keys.period),
  );
  if (!preset || preset === CUSTOM_PRESET) return null;
  return { preset, customRange: null };
}

/**
 * The comparison a source names, when the selector offers it; a custom one
 * needs its `compareFrom` and `compareTo`.
 */
export function readComparisonChoice(
  source: PeriodSource,
  choices: PeriodChoices,
): PeriodComparisonChoice | null {
  const { query, keys } = source;
  const comparison = choices.comparisons.find(
    (entry) => entry === readText(query, keys.compare),
  );
  if (!comparison) return null;
  if (comparison !== CUSTOM_COMPARISON) {
    return { comparison, customCompareRange: null };
  }
  const customCompareRange = readRange(query, keys.compareFrom, keys.compareTo);
  return customCompareRange ? { comparison, customCompareRange } : null;
}

function firstChoice<C>(
  sources: PeriodSource[],
  read: (source: PeriodSource) => C | null,
): C | undefined {
  for (const source of sources) {
    const choice = read(source);
    if (choice) return choice;
  }
  return undefined;
}

/**
 * The selection the sources give, read in order (the URL, then the user's
 * last choice), each half on its own: a half no source names validly comes
 * from `fallback`, silently.
 */
export function resolvePeriodSelection(
  sources: PeriodSource[],
  choices: PeriodChoices,
  fallback: PeriodSelection,
): PeriodSelection {
  const range =
    firstChoice(sources, (source) => readRangeChoice(source, choices)) ??
    fallback;
  const comparison =
    firstChoice(sources, (source) => readComparisonChoice(source, choices)) ??
    fallback;
  return {
    preset: range.preset,
    customRange: range.customRange,
    comparison: comparison.comparison,
    customCompareRange: comparison.customCompareRange,
  };
}

function rangeEntries(
  range: PeriodRange | null,
  fromKey: string,
  toKey: string,
): Array<[string, string]> {
  if (!range) return [];
  return [
    [fromKey, formatPeriodDate(range.from, "start")],
    [toKey, formatPeriodDate(range.to, "end")],
  ];
}

/** A selection as the keys `keys` name. */
export function writePeriodQuery(
  selection: PeriodSelection,
  keys: PeriodQueryKeys,
): Record<string, string> {
  const isCustom = selection.preset === CUSTOM_PRESET;
  const isCustomCompare = selection.comparison === CUSTOM_COMPARISON;
  return Object.fromEntries([
    ...(isCustom
      ? rangeEntries(selection.customRange, keys.from, keys.to)
      : [[keys.period, selection.preset]]),
    [keys.compare, selection.comparison],
    ...(isCustomCompare
      ? rangeEntries(
          selection.customCompareRange,
          keys.compareFrom,
          keys.compareTo,
        )
      : []),
  ]);
}

/** Whether `query` already holds what `keys` would write for `selection`. */
export function isPeriodQueryCurrent(
  query: PeriodQuery,
  keys: PeriodQueryKeys,
  selection: PeriodSelection,
): boolean {
  const written = writePeriodQuery(selection, keys);
  return Object.values(keys).every(
    (key) => readText(query, key) === written[key],
  );
}

/**
 * The search part of a URL with `selection` written under `keys`, and the
 * keys it no longer uses (a preset's `period` once a custom range is picked)
 * removed. Every other parameter, another selector's included, is kept as it
 * was, in its place.
 */
export function mergePeriodSearch(
  search: string,
  keys: PeriodQueryKeys,
  selection: PeriodSelection,
): string {
  const params = new URLSearchParams(search);
  const written = writePeriodQuery(selection, keys);
  for (const key of Object.values(keys)) {
    const value = written[key];
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
