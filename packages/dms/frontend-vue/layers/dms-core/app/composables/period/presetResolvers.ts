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

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(
    END_OF_DAY_HOURS,
    END_OF_DAY_MINUTES,
    END_OF_DAY_SECONDS,
    END_OF_DAY_MS,
  );
  return next;
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_PER_DAY);
}

function addHours(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_PER_HOUR);
}

function startOfMonth(date: Date, monthOffset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
}

function endOfMonth(date: Date, monthOffset = 0): Date {
  const next = new Date(
    date.getFullYear(),
    date.getMonth() + monthOffset + 1,
    0,
  );
  return endOfDay(next);
}

function startOfQuarter(date: Date, quarterOffset = 0): Date {
  const quarter = Math.floor(date.getMonth() / 3) + quarterOffset;
  return new Date(date.getFullYear(), quarter * 3, 1);
}

function endOfQuarter(date: Date, quarterOffset = 0): Date {
  const quarter = Math.floor(date.getMonth() / 3) + quarterOffset;
  return endOfDay(new Date(date.getFullYear(), quarter * 3 + 3, 0));
}

function startOfYear(date: Date, yearOffset = 0): Date {
  return new Date(date.getFullYear() + yearOffset, 0, 1);
}

function endOfYear(date: Date, yearOffset = 0): Date {
  return endOfDay(new Date(date.getFullYear() + yearOffset, 11, 31));
}

const PRESET_RANGE_RESOLVERS: Record<
  Exclude<PeriodPreset, "custom">,
  (now: Date) => PeriodRange
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
};

const RELATIVE_PRESETS = new Set<PeriodPreset>(["last-hour", "last-24h"]);

/**
 * Relative presets resolve against the instant they are read: a live
 * dashboard must re-resolve them as time passes, where calendar presets
 * stay valid until the preset itself changes.
 */
export function isRelativePreset(preset: PeriodPreset): boolean {
  return RELATIVE_PRESETS.has(preset);
}

/**
 * Resolves a preset into a concrete range.
 *
 * Calendar presets snap to day boundaries (start-of-day to end-of-day), while
 * the relative ones (`last-hour`, `last-24h`) keep instant bounds so an ops
 * dashboard can read sub-day granularity.
 */
export function resolvePresetRange(
  preset: PeriodPreset,
  now: Date,
  fallbackRange: PeriodRange,
): PeriodRange {
  if (preset === "custom") return fallbackRange;
  return PRESET_RANGE_RESOLVERS[preset](now);
}
