import type { PeriodComparison, PeriodRange } from "./types";

const NON_OVERLAP_GAP_MS = 1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isLocalMidnight(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
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
    const from = new Date(range.from);
    from.setDate(from.getDate() - days);
    return {
      from,
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
  const previousFrom = new Date(range.from);
  previousFrom.setFullYear(previousFrom.getFullYear() - 1);
  const previousTo = new Date(range.to);
  previousTo.setFullYear(previousTo.getFullYear() - 1);
  return { from: previousFrom, to: previousTo };
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
 * move their midnight boundaries.
 */
export function resolveComparisonRange(
  comparison: PeriodComparison,
  range: PeriodRange,
  customRange: PeriodRange | null,
): PeriodRange | null {
  if (comparison === "none") return null;
  if (comparison === "custom") return customRange;
  return COMPARISON_RESOLVERS[comparison](range);
}
