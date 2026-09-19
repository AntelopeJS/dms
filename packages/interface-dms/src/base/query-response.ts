/**
 * Turning the points a generated query answers into what a block reads.
 *
 * A calculation answers one thing — a measure per group — while the blocks that
 * read it want different arrangements of it: a chart wants the points, a card
 * wants a headline figure above them, a ranked list wants entries. Rather than
 * teach the generator to write each arrangement into every route, a route hands
 * its points to one of these and returns the result.
 *
 * That keeps a generated route to a single expression, which is what lets the
 * builder go on reading its own code back.
 */

/** One measured group: what it is, and what was measured. */
export interface SeriesPoint {
  x: number | string;
  y: number;
}

/** How the headline figure is taken from the points. */
export type SeriesMeasure = "count" | "sum" | "avg" | "min" | "max";

export interface SeriesOptions {
  measure?: SeriesMeasure;
  /** The same calculation over the preceding period, when one was asked for. */
  previous?: SeriesPoint[];
}

/** A figure alongside the one before it, and the share between them. */
export interface ComparedFigure {
  previousValue?: number;
  delta?: number;
}

export interface ChartCardData {
  value: number;
  series: SeriesPoint[];
  previousValue?: number;
  delta?: number;
  comparisonSeries?: SeriesPoint[];
}

export interface KpiCardData {
  value: number;
  previousValue?: number;
  delta?: number;
  sparkline?: number[];
}

export interface TopListEntry {
  id: string | number;
  title: string;
  value: number;
  delta?: number | null;
}

export interface TopListData {
  items: TopListEntry[];
}

/**
 * The figure a card shows above its chart.
 *
 * Counts and sums add up; a minimum or a maximum over groups is the minimum or
 * maximum of the group figures. An average is the average of the group averages,
 * which is not the average over all the rows — the two differ whenever the groups
 * are not the same size, and computing the real one would mean a second query.
 * Said here because a card showing it should not imply otherwise.
 */
export function headline(
  points: SeriesPoint[],
  measure: SeriesMeasure = "sum",
): number {
  if (points.length === 0) {
    return 0;
  }
  const values = points.map((point) => point.y);
  if (measure === "min") {
    return Math.min(...values);
  }
  if (measure === "max") {
    return Math.max(...values);
  }
  const sum = values.reduce((running, value) => running + value, 0);
  return measure === "avg" ? sum / values.length : sum;
}

/** The share a figure gained or lost against the one before it. */
function variation(current: number, previous: number): number | undefined {
  if (previous === 0) {
    return current === 0 ? 0 : undefined;
  }
  return (current - previous) / previous;
}

/** Fill in the figure before this one and the share it moved, when there is one. */
function addComparison(
  target: ComparedFigure,
  value: number,
  options: SeriesOptions,
): void {
  if (!options.previous) {
    return;
  }
  const previousValue = headline(options.previous, options.measure);
  target.previousValue = previousValue;
  const delta = variation(value, previousValue);
  if (delta !== undefined) {
    target.delta = delta;
  }
}

/** Points as a chart card reads them: a figure, its series, and its variation. */
export function chartCardData(
  points: SeriesPoint[],
  options: SeriesOptions = {},
): ChartCardData {
  const value = headline(points, options.measure);
  const data: ChartCardData = { value, series: points };
  addComparison(data, value, options);
  if (options.previous) {
    data.comparisonSeries = options.previous;
  }
  return data;
}

/**
 * Points as a KPI card reads them: one figure, and the points as its sparkline.
 *
 * The card draws the trend behind the number from the same calculation, so a KPI
 * grouped over time costs no more than one without.
 */
export function kpiCardData(
  points: SeriesPoint[],
  options: SeriesOptions = {},
): KpiCardData {
  const value = headline(points, options.measure);
  const data: KpiCardData = { value };
  addComparison(data, value, options);
  // One point is a figure, not a trend: a sparkline of it would draw a dot.
  if (points.length > 1) {
    data.sparkline = points.map((point) => point.y);
  }
  return data;
}

/** Points as a ranked list reads them, each group an entry. */
export function topListData(
  points: SeriesPoint[],
  options: SeriesOptions = {},
): TopListData {
  const before = new Map(
    (options.previous ?? []).map((point) => [String(point.x), point.y]),
  );
  return {
    items: points.map((point) => {
      const entry: TopListEntry = {
        id: point.x,
        title: String(point.x),
        value: point.y,
      };
      const previous = before.get(String(point.x));
      const delta =
        previous === undefined ? undefined : variation(point.y, previous);
      if (delta !== undefined) {
        entry.delta = delta;
      }
      return entry;
    }),
  };
}
