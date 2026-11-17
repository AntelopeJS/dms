import { deterministicRandom, type NamedSeries } from "./dashboard-data";

const ONE_DAY_MS = 86400000;
const HALF_DAY_MS = ONE_DAY_MS / 2;
const DEFAULT_PERIOD_DAYS = 30;
const MAX_PERIOD_DAYS = 366;
const ISO_DATE_LENGTH = 10;

function isoDate(time: number): string {
  return new Date(time).toISOString().slice(0, ISO_DATE_LENGTH);
}

function dayTime(value: string | undefined, shift: number): number | undefined {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return undefined;
  return Date.parse(isoDate(time + shift));
}

/**
 * The calendar days of the selected period, up to today: a period still
 * running ("this month") stops at today, and no period means the last 30 days.
 */
export function periodDays(from?: string, to?: string): string[] {
  const today = Date.parse(isoDate(Date.now()));
  const end = Math.min(dayTime(to, -HALF_DAY_MS) ?? today, today);
  const start =
    dayTime(from, HALF_DAY_MS) ?? end - (DEFAULT_PERIOD_DAYS - 1) * ONE_DAY_MS;
  const length = Math.round((end - start) / ONE_DAY_MS) + 1;
  const count = Math.min(Math.max(length, 1), MAX_PERIOD_DAYS);
  return Array.from({ length: count }, (_, index) =>
    isoDate(start + index * ONE_DAY_MS),
  );
}

export interface ValueRange {
  min: number;
  max: number;
}

export function buildDailySeries(
  name: string,
  seed: number,
  range: ValueRange,
  days: string[],
): NamedSeries {
  const data = days.map((x, index) => ({
    x,
    y: Math.round(
      range.min + deterministicRandom(seed, index) * (range.max - range.min),
    ),
  }));
  return { name, data };
}
