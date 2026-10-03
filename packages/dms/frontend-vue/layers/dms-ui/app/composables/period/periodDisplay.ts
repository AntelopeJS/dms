import {
  type CalendarDate,
  fromDate,
  getLocalTimeZone,
  toCalendarDate,
} from "@internationalized/date";
import {
  END_OF_DAY_HOURS,
  END_OF_DAY_MINUTES,
  END_OF_DAY_MS,
  END_OF_DAY_SECONDS,
  MS_PER_DAY,
  MS_PER_HOUR,
  type PeriodRange,
} from "#dms-core/app/composables/period/types";
import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";

// Owned by the regional formatters, which also answer the user's own choice.
export { localeWeekStart } from "#dms-core/app/utils/regional";

/** A day range as the range calendar reads and writes it. */
export interface CalendarRange {
  start: CalendarDate;
  end: CalendarDate;
}

export function dateToCalendar(date: Date): CalendarDate {
  return toCalendarDate(fromDate(date, getLocalTimeZone()));
}

export function calendarToDate(
  calendar: CalendarDate,
  asEndOfDay: boolean,
): Date {
  const native = new Date(calendar.year, calendar.month - 1, calendar.day);
  if (asEndOfDay) {
    native.setHours(
      END_OF_DAY_HOURS,
      END_OF_DAY_MINUTES,
      END_OF_DAY_SECONDS,
      END_OF_DAY_MS,
    );
  }
  return native;
}

export function rangeToCalendar(range: PeriodRange): CalendarRange {
  return { start: dateToCalendar(range.from), end: dateToCalendar(range.to) };
}

/** Whole days, start of the first to end of the last. */
export function calendarToRange(range: CalendarRange): PeriodRange {
  return {
    from: calendarToDate(range.start, false),
    to: calendarToDate(range.end, true),
  };
}

function isStartOfDay(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

function isEndOfDay(date: Date): boolean {
  return (
    date.getHours() === END_OF_DAY_HOURS &&
    date.getMinutes() === END_OF_DAY_MINUTES
  );
}

// Up to a day and an hour: `last-24h` plus slack for a DST shift.
const TIMED_RANGE_MAX_MS = MS_PER_DAY + MS_PER_HOUR;

/**
 * Relative presets (`last-hour`, `last-24h`) keep instant bounds: their
 * label carries the time, where a whole-day range only needs dates. Long
 * ranges stay on dates even off day bounds (a DST shift moves them by an
 * hour).
 */
function hasTimeBounds(range: PeriodRange): boolean {
  const span = range.to.getTime() - range.from.getTime();
  if (span > TIMED_RANGE_MAX_MS) return false;
  return !isStartOfDay(range.from) || !isEndOfDay(range.to);
}

type FormatOptions = Intl.DateTimeFormatOptions;

// Node's ICU and Chrome's disagree on the spaces of a range: Node joins with
// thin spaces (U+2009 around the dash, U+202F before AM/PM) where Chrome
// prints plain ones. One spelling on both sides keeps the server-rendered
// label from mismatching at hydration.
const ICU_SPACES = /[\u2009\u202f]/g;
const PLAIN_SPACE = " ";

function normalizeSpaces(text: string): string {
  return text.replace(ICU_SPACES, PLAIN_SPACE);
}

const DAY_FORMAT: FormatOptions = { month: "short", day: "numeric" };
const TIME_FORMAT: FormatOptions = { hour: "2-digit", minute: "2-digit" };

function formatRangeWith(
  range: PeriodRange,
  locale: string,
  options: FormatOptions,
): string {
  // A period's bounds are computed in the browser's zone: only the clock
  // follows the user's preference.
  const formatter = regionalDateTimeFormat(locale, options, {
    keepLocalZone: true,
  });
  if (range.to.getTime() < range.from.getTime()) {
    return normalizeSpaces(formatter.format(range.from));
  }
  return normalizeSpaces(formatter.formatRange(range.from, range.to));
}

/**
 * Compact range label (design .ps__range): "31 Aug – 29 Sep 2026" in the
 * reader's locale. `withYear: false` drops the year, for a comparison range
 * that falls in the same year as the main one.
 */
export function formatPeriodRange(
  range: PeriodRange,
  locale: string,
  withYear = true,
): string {
  // A timed range reads "30 Sep, 04:46 – 1 Oct, 04:46": the year is noise.
  if (hasTimeBounds(range)) {
    return formatRangeWith(range, locale, { ...DAY_FORMAT, ...TIME_FORMAT });
  }
  const options: FormatOptions = withYear
    ? { ...DAY_FORMAT, year: "numeric" }
    : DAY_FORMAT;
  return formatRangeWith(range, locale, options);
}

export interface PeriodDuration {
  unit: "days" | "hours";
  count: number;
}

/** Length of a range in whole days, or in hours below a day. */
export function periodDuration(range: PeriodRange): PeriodDuration {
  const span = Math.max(range.to.getTime() - range.from.getTime(), 0);
  if (span < MS_PER_DAY - MS_PER_HOUR) {
    return {
      unit: "hours",
      count: Math.max(Math.round(span / MS_PER_HOUR), 1),
    };
  }
  return { unit: "days", count: Math.max(Math.round(span / MS_PER_DAY), 1) };
}
