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
import { readerClock } from "#dms-core/app/composables/period/periodClock";

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

/** Which bound of a range stays put when the range has to shrink. */
export type CalendarRangeAnchor = "start" | "end";

const RANGE_SHRINKERS: Record<
  CalendarRangeAnchor,
  (range: CalendarRange, span: number) => CalendarRange
> = {
  start: (range, span) => ({
    start: range.start,
    end: range.start.add({ days: span }),
  }),
  end: (range, span) => ({
    start: range.end.subtract({ days: span }),
    end: range.end,
  }),
};

/** The number of days a range covers, both ends included. */
export function calendarRangeDays(range: CalendarRange): number {
  return range.end.compare(range.start) + 1;
}

/**
 * Shrinks a range to at most `maxDays` days, keeping its `anchor` bound and
 * moving the other one. Without a limit, or within it, the range is returned
 * as is.
 */
export function limitCalendarRange(
  range: CalendarRange,
  maxDays: number | undefined,
  anchor: CalendarRangeAnchor,
): CalendarRange {
  if (!maxDays || calendarRangeDays(range) <= maxDays) return range;
  return RANGE_SHRINKERS[anchor](range, maxDays - 1);
}

/**
 * Whether a range starting (or ending) on `pickedDay` and reaching `date`
 * would cover more than `maxDays` days.
 */
export function isBeyondMaxDays(
  date: CalendarDate,
  pickedDay: CalendarDate,
  maxDays: number | undefined,
): boolean {
  if (!maxDays) return false;
  return Math.abs(date.compare(pickedDay)) >= maxDays;
}

// A period's days are the reader's calendar days (`readerClock`), on the
// server as in the browser.
function isStartOfDay(date: Date): boolean {
  const { hours, minutes, seconds, milliseconds } = readerClock().wall(date);
  return hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0;
}

function isEndOfDay(date: Date): boolean {
  const { hours, minutes } = readerClock().wall(date);
  return hours === END_OF_DAY_HOURS && minutes === END_OF_DAY_MINUTES;
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

const DAYS_PER_WEEK = 7;
const YESTERDAY_OFFSET = -1;
const WEEKDAY_FORMAT: FormatOptions = { weekday: "short" };

function localDayStart(date: Date): number {
  const clock = readerClock();
  return clock
    .instant({
      ...clock.wall(date),
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    })
    .getTime();
}

function daysBefore(date: Date, now: Date): number {
  return Math.round((localDayStart(now) - localDayStart(date)) / MS_PER_DAY);
}

function formatWith(date: Date, locale: string, options: FormatOptions) {
  const formatter = regionalDateTimeFormat(locale, options, {
    keepLocalZone: true,
  });
  return normalizeSpaces(formatter.format(date));
}

function relativeDayPrefix(date: Date, now: Date, locale: string): string {
  const days = daysBefore(date, now);
  if (days <= 0) return "";
  if (days === 1) {
    const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    return `${format.format(YESTERDAY_OFFSET, "day")} `;
  }
  if (days < DAYS_PER_WEEK) {
    return `${formatWith(date, locale, WEEKDAY_FORMAT)} `;
  }
  const clock = readerClock();
  const sameYear = clock.wall(date).year === clock.wall(now).year;
  const day: FormatOptions = sameYear
    ? DAY_FORMAT
    : { ...DAY_FORMAT, year: "numeric" };
  return `${formatWith(date, locale, day)}, `;
}

/**
 * An instant as seen from `now`, in the reader's locale: the time alone
 * today ("11:52"), then "yesterday 11:52", the weekday within a week
 * ("Mon 11:52"), and the date beyond ("Oct 4, 11:52", with its year when
 * not this one's). The start of a window labelled relative to now.
 */
export function formatRelativeInstant(
  date: Date,
  now: Date,
  locale: string,
): string {
  const time = formatWith(date, locale, TIME_FORMAT);
  return `${relativeDayPrefix(date, now, locale)}${time}`;
}
