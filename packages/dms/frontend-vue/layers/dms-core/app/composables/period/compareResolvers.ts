import type { PeriodComparison, PeriodRange } from "./types";

const NON_OVERLAP_GAP_MS = 1;

function shiftPreviousPeriod(range: PeriodRange): PeriodRange {
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
 * range, offset by a single millisecond so the two never overlap.
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
