import {
  END_OF_DAY_HOURS,
  END_OF_DAY_MINUTES,
  END_OF_DAY_MS,
  END_OF_DAY_SECONDS,
  MS_PER_DAY,
  MS_PER_HOUR,
  type PeriodPreset,
  type PeriodRange,
} from "./types";
import { readerClock } from "./periodClock";

// Resolved in the reader's calendar (`readerClock`): the browser's zone, on
// the server as in the browser.
function atTime(
  date: Date,
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
): Date {
  const clock = readerClock();
  return clock.instant({
    ...clock.wall(date),
    hours,
    minutes,
    seconds,
    milliseconds,
  });
}

function startOfDay(date: Date): Date {
  return atTime(date, 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return atTime(
    date,
    END_OF_DAY_HOURS,
    END_OF_DAY_MINUTES,
    END_OF_DAY_SECONDS,
    END_OF_DAY_MS,
  );
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_PER_DAY);
}

function addHours(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_PER_HOUR);
}

/** Midnight of a day given as year, month and day; they roll over as `Date`'s. */
function dayStart(year: number, month: number, day: number): Date {
  return readerClock().instant({
    year,
    month,
    day,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
}

function startOfMonth(date: Date, monthOffset = 0): Date {
  const { year, month } = readerClock().wall(date);
  return dayStart(year, month + monthOffset, 1);
}

function endOfMonth(date: Date, monthOffset = 0): Date {
  const { year, month } = readerClock().wall(date);
  return endOfDay(dayStart(year, month + monthOffset + 1, 0));
}

function startOfQuarter(date: Date, quarterOffset = 0): Date {
  const { year, month } = readerClock().wall(date);
  const quarter = Math.floor(month / 3) + quarterOffset;
  return dayStart(year, quarter * 3, 1);
}

function endOfQuarter(date: Date, quarterOffset = 0): Date {
  const { year, month } = readerClock().wall(date);
  const quarter = Math.floor(month / 3) + quarterOffset;
  return endOfDay(dayStart(year, quarter * 3 + 3, 0));
}

function startOfYear(date: Date, yearOffset = 0): Date {
  return dayStart(readerClock().wall(date).year + yearOffset, 0, 1);
}

function endOfYear(date: Date, yearOffset = 0): Date {
  return endOfDay(dayStart(readerClock().wall(date).year + yearOffset, 11, 31));
}

const PRESET_RANGE_RESOLVERS: Record<
  Exclude<PeriodPreset, "custom">,
  (now: Date) => PeriodRange | null
> = {
  "last-hour": (now) => ({ from: addHours(now, -1), to: now }),
  "last-24h": (now) => ({ from: addDays(now, -1), to: now }),
  today: (now) => ({ from: startOfDay(now), to: endOfDay(now) }),
  yesterday: (now) => {
    const yesterday = addDays(now, -1);
    return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
  },
  "last-7-days": (now) => ({
    from: startOfDay(addDays(now, -6)),
    to: endOfDay(now),
  }),
  "last-30-days": (now) => ({
    from: startOfDay(addDays(now, -29)),
    to: endOfDay(now),
  }),
  "last-90-days": (now) => ({
    from: startOfDay(addDays(now, -89)),
    to: endOfDay(now),
  }),
  "this-month": (now) => ({
    from: startOfMonth(now),
    to: endOfMonth(now),
  }),
  "last-month": (now) => ({
    from: startOfMonth(now, -1),
    to: endOfMonth(now, -1),
  }),
  "this-quarter": (now) => ({
    from: startOfQuarter(now),
    to: endOfQuarter(now),
  }),
  "last-quarter": (now) => ({
    from: startOfQuarter(now, -1),
    to: endOfQuarter(now, -1),
  }),
  ytd: (now) => ({
    from: startOfYear(now),
    to: endOfDay(now),
  }),
  "last-year": (now) => ({
    from: startOfYear(now, -1),
    to: endOfYear(now, -1),
  }),
  all: () => null,
};

const HOURS_PER_DAY = 24;
const RELATIVE_PRESETS = new Set<PeriodPreset>(["last-hour", "last-24h"]);
const UNBOUNDED_PRESETS = new Set<PeriodPreset>(["all", "custom"]);

/**
 * Relative presets resolve against the instant they are read: a live
 * dashboard must re-resolve them as time passes, where calendar presets
 * stay valid until the next local midnight.
 */
export function isRelativePreset(preset: PeriodPreset): boolean {
  return RELATIVE_PRESETS.has(preset);
}

/**
 * Calendar presets (`today`, `last-7-days`, `this-month`...) snap to day
 * boundaries: they hold for the rest of the day, then move at the next local
 * midnight. `custom` and `all` never move on their own.
 */
export function isCalendarPreset(preset: PeriodPreset): boolean {
  return !RELATIVE_PRESETS.has(preset) && !UNBOUNDED_PRESETS.has(preset);
}

/** The time left until the next local midnight, from `now`. */
export function msUntilNextMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(HOURS_PER_DAY, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/**
 * Resolves a preset into a concrete range.
 *
 * Calendar presets snap to day boundaries (start-of-day to end-of-day), while
 * the relative ones (`last-hour`, `last-24h`) keep instant bounds so an ops
 * dashboard can read sub-day granularity. `all` has no bounds: `null`.
 */
export function resolvePresetRange(
  preset: PeriodPreset,
  now: Date,
  fallbackRange: PeriodRange,
): PeriodRange | null {
  if (preset === "custom") return fallbackRange;
  return PRESET_RANGE_RESOLVERS[preset](now);
}
