import { readerClock } from "./periodClock";
import type { PeriodComparison, PeriodPreset, PeriodRange } from "./types";

const NON_OVERLAP_GAP_MS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isLocalMidnight(date: Date): boolean {
  const { hours, minutes, seconds, milliseconds } = readerClock().wall(date);
  return hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0;
}

/** `date` moved by whole calendar days and years, its time of day kept. */
function shiftCalendar(date: Date, days: number, years: number): Date {
  const clock = readerClock();
  const wall = clock.wall(date);
  return clock.instant({
    ...wall,
    year: wall.year + years,
    day: wall.day + days,
  });
}

/** A range of whole local days: midnight to the last millisecond of a day. */
function isWholeDayRange(range: PeriodRange): boolean {
  return (
    isLocalMidnight(range.from) &&
    isLocalMidnight(new Date(range.to.getTime() + NON_OVERLAP_GAP_MS))
  );
}

const MONTHS_PER_YEAR = 12;
const MONTHS_PER_QUARTER = 3;

const PRESET_MONTH_SPANS: Partial<Record<PeriodPreset, number>> = {
  "this-month": 1,
  "last-month": 1,
  "this-quarter": MONTHS_PER_QUARTER,
  "last-quarter": MONTHS_PER_QUARTER,
  ytd: MONTHS_PER_YEAR,
  "last-year": MONTHS_PER_YEAR,
};

/** What a comparison is resolved against beyond the range itself. */
export interface ComparisonContext {
  /** The preset the range comes from: a calendar one compares by calendar. */
  preset?: PeriodPreset;
  /**
   * The instant the range was resolved at: a range running past today
   * (`this-month` on the 18th) compares what has elapsed of it.
   */
  now?: Date;
}

/** `date` moved by whole months, its day kept within the month reached. */
function shiftMonths(date: Date, months: number): Date {
  const clock = readerClock();
  const wall = clock.wall(date);
  const month = wall.month + months;

  const lastDay = clock.wall(
    clock.instant({ ...wall, month: month + 1, day: 0 }),
  ).day;
  return clock.instant({ ...wall, month, day: Math.min(wall.day, lastDay) });
}

/** Whether `date` is the midnight opening a calendar month. */
function isMonthStart(date: Date): boolean {
  return isLocalMidnight(date) && readerClock().wall(date).day === 1;
}

/** Months from one month start to another. */
function monthsBetween(from: Date, to: Date): number {
  const clock = readerClock();
  const start = clock.wall(from);
  const end = clock.wall(to);
  return (end.year - start.year) * MONTHS_PER_YEAR + end.month - start.month;
}

/** The instant right after a range: the start of what follows it. */
const afterRange = (range: PeriodRange): Date =>
  new Date(range.to.getTime() + NON_OVERLAP_GAP_MS);

/**
 * The calendar months a range's previous period steps back by: the unit of a
 * calendar preset, else the months of a range made of whole months (a custom
 * September compares to August). Any other range has none.
 */
function calendarMonthSpan(
  range: PeriodRange,
  preset: PeriodPreset | undefined,
): number | undefined {
  if (!isMonthStart(range.from)) return undefined;
  const presetSpan = preset ? PRESET_MONTH_SPANS[preset] : undefined;
  if (presetSpan) return presetSpan;
  const end = afterRange(range);
  return isMonthStart(end) ? monthsBetween(range.from, end) : undefined;
}

/** The last millisecond of `date`'s day. */
function endOfDay(date: Date): Date {
  const clock = readerClock();
  const nextDay = clock.instant({
    ...clock.wall(date),
    day: clock.wall(date).day + 1,
    hours: 0,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
  return new Date(nextDay.getTime() - NON_OVERLAP_GAP_MS);
}

/**
 * What a comparison measures of a range: all of it, or what has elapsed of
 * it when it runs past today — the rest holds no data yet, and comparing it
 * with a whole period reads as a fall.
 */
function elapsedEnd(range: PeriodRange, now: Date | undefined): Date {
  if (!now) return range.to;
  const today = endOfDay(now);
  return range.to.getTime() > today.getTime() ? today : range.to;
}

/**
 * The same span of the calendar `months` earlier: the whole month, quarter
 * or year before when the range is complete and ends with a month, else its
 * elapsed days (the 1st to the 18th of the month before).
 */
function shiftCalendarPeriod(
  range: PeriodRange,
  months: number,
  end: Date,
): PeriodRange {
  const from = shiftMonths(range.from, -months);
  const isComplete = end.getTime() === range.to.getTime();
  if (isComplete && isMonthStart(afterRange(range))) {
    return { from, to: new Date(range.from.getTime() - NON_OVERLAP_GAP_MS) };
  }
  return { from, to: endOfDay(shiftMonths(end, -months)) };
}

function shiftPreviousPeriod(
  range: PeriodRange,
  context: ComparisonContext,
): PeriodRange {
  const months = calendarMonthSpan(range, context.preset);
  if (months) {
    return shiftCalendarPeriod(range, months, elapsedEnd(range, context.now));
  }
  return shiftEqualLength(range);
}

function shiftEqualLength(range: PeriodRange): PeriodRange {
  if (isWholeDayRange(range)) {
    const end = range.to.getTime() + NON_OVERLAP_GAP_MS;
    const days = Math.round((end - range.from.getTime()) / MS_PER_DAY);
    return {
      from: shiftCalendar(range.from, -days, 0),
      to: new Date(range.from.getTime() - NON_OVERLAP_GAP_MS),
    };
  }

  const duration = range.to.getTime() - range.from.getTime();
  const shiftMs = duration + NON_OVERLAP_GAP_MS;
  return {
    from: new Date(range.from.getTime() - shiftMs),
    to: new Date(range.to.getTime() - shiftMs),
  };
}

function shiftPreviousYear(
  range: PeriodRange,
  context: ComparisonContext,
): PeriodRange {
  const end = elapsedEnd(range, context.now);
  if (end.getTime() !== range.to.getTime()) {
    return shiftCalendarPeriod(range, MONTHS_PER_YEAR, end);
  }
  return {
    from: shiftCalendar(range.from, 0, -1),
    to: shiftCalendar(range.to, 0, -1),
  };
}

const COMPARISON_RESOLVERS: Record<
  Exclude<PeriodComparison, "none" | "custom">,
  (range: PeriodRange, context: ComparisonContext) => PeriodRange
> = {
  "previous-period": shiftPreviousPeriod,
  "previous-year": shiftPreviousYear,
};

/**
 * Resolves the range a period is compared against.
 *
 * `previous-period` follows the calendar for a calendar range: a month, a
 * quarter or a year (`this-month`, `last-quarter`, `ytd`…, or a custom range
 * of whole months) compares to the one before — September to August, Q3 to
 * Q2. Any other range compares to the equal-length span immediately before
 * it, offset by a single millisecond so the two never overlap; ranges of
 * whole days are measured in calendar days, so daylight saving changes don't
 * move their midnight boundaries.
 *
 * A range running past today (`this-month` on the 18th) compares what has
 * elapsed of it — the 1st to the 18th of the month before, or of the year
 * before with `previous-year` — not a whole period against days that hold no
 * data yet. A range with no bounds (`all`) has nothing to compare against:
 * `null`.
 */
export function resolveComparisonRange(
  comparison: PeriodComparison,
  range: PeriodRange | null,
  customRange: PeriodRange | null,
  context: ComparisonContext = {},
): PeriodRange | null {
  if (comparison === "none" || !range) return null;
  if (comparison === "custom") return customRange;
  return COMPARISON_RESOLVERS[comparison](range, context);
}
