import { readerClock } from "./periodClock";
import type { PeriodComparison, PeriodRange } from "./types";

const NON_OVERLAP_GAP_MS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// In the reader's calendar (`readerClock`), as the range was resolved.
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

function shiftPreviousPeriod(range: PeriodRange): PeriodRange {
  // Whole-day ranges move by calendar days, so a span crossing a daylight
  // saving change still starts at midnight (a fixed-ms shift lands an hour off).
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

function shiftPreviousYear(range: PeriodRange): PeriodRange {
  return {
    from: shiftCalendar(range.from, 0, -1),
    to: shiftCalendar(range.to, 0, -1),
  };
}

const COMPARISON_RESOLVERS: Record<
  Exclude<PeriodComparison, "none" | "custom">,
  (range: PeriodRange) => PeriodRange
> = {
  "previous-period": shiftPreviousPeriod,
  "previous-year": shiftPreviousYear,
};

/**
 * Resolves the range a period is compared against.
 *
 * `previous-period` returns the equal-length span immediately before the
 * range, offset by a single millisecond so the two never overlap. Ranges of
 * whole days are measured in calendar days, so daylight saving changes don't
 * move their midnight boundaries. A range with no bounds (`all`) has nothing
 * to compare against: `null`.
 */
export function resolveComparisonRange(
  comparison: PeriodComparison,
  range: PeriodRange | null,
  customRange: PeriodRange | null,
): PeriodRange | null {
  if (comparison === "none" || !range) return null;
  if (comparison === "custom") return customRange;
  return COMPARISON_RESOLVERS[comparison](range);
}
