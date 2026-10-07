import type { SeriesMeasure, SeriesPoint } from "../query-response";

const DEFAULT_MEASURE: SeriesMeasure = "sum";

const total = (values: number[]): number =>
  values.reduce((running, value) => running + value, 0);

const HEADLINE_BY_MEASURE: Record<SeriesMeasure, (values: number[]) => number> =
  {
    count: total,
    sum: total,
    avg: (values) => total(values) / values.length,
    min: (values) => Math.min(...values),
    max: (values) => Math.max(...values),
  };

/**
 * The figure a card shows above its chart, or nothing when there is none.
 *
 * Unmeasured groups are dropped rather than read as zero: a minimum or an
 * average taken over invented zeroes is wrong in a way no reader can see. With
 * nothing left to measure the answer is `undefined`, and every caller leaves the
 * field out of its response instead of writing a figure the query never gave.
 *
 * Counts and sums add up; a minimum or a maximum over groups is the minimum or
 * maximum of the group figures. An average is the average of the group averages,
 * which is not the average over all the rows — the two differ whenever the groups
 * are not the same size, and computing the real one would mean a second query.
 * Said here because a card showing it should not imply otherwise.
 *
 * @internal
 */
export function headline(
  points: SeriesPoint[],
  measure: SeriesMeasure = DEFAULT_MEASURE,
): number | undefined {
  const values = measuredValues(points);
  if (values.length === 0) {
    return undefined;
  }
  return HEADLINE_BY_MEASURE[measure](values);
}

/**
 * What the calculation actually measured, unmeasured groups dropped.
 *
 * @internal
 */
export function measuredValues(points: SeriesPoint[]): number[] {
  return points
    .map((point) => point.y)
    .filter((value): value is number => value !== null);
}
