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
 *
 * Nothing here invents a figure it was not given: an absent measure stays absent
 * all the way to the block, because a fabricated zero reads exactly like a
 * measured one.
 */
import type { ChartSeries } from "./chart";

/** One measured group: what it is, and what was measured. */
export interface SeriesPoint {
  x: number | string;
  /** Null for a group the calculation found nothing to measure in. */
  y: number | null;
}

/** How the headline figure is taken from the points. */
export type SeriesMeasure = "count" | "sum" | "avg" | "min" | "max";

export interface SeriesOptions {
  measure: SeriesMeasure;
  /**
   * What a legend and a tooltip call the series. The caller is expected to supply
   * one a reader recognizes — the builder derives it from the measured field —
   * because all that is left to name a series by is the measure's own word.
   */
  label?: string;
  /** The same calculation over the preceding period, when one was asked for. */
  previous?: SeriesPoint[];
}

/** A figure alongside the one before it, and the share between them. */
export interface ComparedFigure {
  /** Absent when the preceding period measured nothing to compare against. */
  previousValue?: number;
  /**
   * Absent when no share can be stated, which includes a preceding zero: growth
   * away from nothing is unbounded, so 0 to 100 carries no variation at all.
   * Blocks show none in that case rather than a stand-in for one. Written down
   * because consumers depend on it, not left to be discovered.
   */
  delta?: number;
}

export interface ChartCardData extends ComparedFigure {
  /** Absent when no group was measured; see `headline`. */
  value?: number;
  series: ChartSeries[];
  comparisonSeries?: ChartSeries[];
}

export interface KpiCardData extends ComparedFigure {
  /** Absent when no group was measured; see `headline`. */
  value?: number;
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

const DEFAULT_MEASURE: SeriesMeasure = "sum";

const MS_PER_DAY = 86_400_000;

/**
 * The window a time bucket's key can fall in. Read as milliseconds, a group key
 * outside it is a quantity or an identifier rather than an instant.
 */
const BUCKET_EPOCH_FIRST = Date.UTC(2000, 0, 1);
const BUCKET_EPOCH_LAST = Date.UTC(2100, 0, 1);

const ISO_DATE_END = 10;
const ISO_MINUTE_END = 16;

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

/** What the calculation actually measured, unmeasured groups dropped. */
function measuredValues(points: SeriesPoint[]): number[] {
  return points
    .map((point) => point.y)
    .filter((value): value is number => value !== null);
}

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
  value: number | undefined,
  options: SeriesOptions,
): void {
  if (!options.previous) {
    return;
  }
  const previousValue = headline(options.previous, options.measure);
  if (previousValue === undefined) {
    return;
  }
  target.previousValue = previousValue;
  if (value === undefined) {
    return;
  }
  const delta = variation(value, previousValue);
  if (delta !== undefined) {
    target.delta = delta;
  }
}

/**
 * The points as the one named series a chart draws.
 *
 * A chart reads `{ name, data }` and indexes into `data`; handed the bare points
 * it takes each of them for a series with nothing in it and draws an empty
 * canvas, without an error anywhere to say why.
 */
function chartSeries(points: SeriesPoint[], name: string): ChartSeries[] {
  return [{ name, data: points }];
}

/** Points as a chart card reads them: a figure, its series, and its variation. */
export function chartCardData(
  points: SeriesPoint[],
  options: SeriesOptions,
): ChartCardData {
  const name = options.label ?? options.measure;
  const data: ChartCardData = { series: chartSeries(points, name) };
  const value = headline(points, options.measure);
  if (value !== undefined) {
    data.value = value;
  }
  addComparison(data, value, options);
  if (options.previous && options.previous.length > 0) {
    // Named after the series it is compared against, not marked apart in its
    // name: the block already sets it apart by colour and stroke, and a word
    // added here would reach the legend in one language whatever the reader's is.
    data.comparisonSeries = chartSeries(options.previous, name);
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
  options: SeriesOptions,
): KpiCardData {
  const data: KpiCardData = {};
  const value = headline(points, options.measure);
  if (value !== undefined) {
    data.value = value;
  }
  addComparison(data, value, options);
  const values = measuredValues(points);
  // One point is a figure, not a trend: a sparkline of it would draw a dot.
  if (values.length > 1) {
    data.sparkline = values;
  }
  return data;
}

/**
 * A group's key as a person reads it.
 *
 * A time bucket arrives as epoch milliseconds, and a row titled `1772409600000`
 * names nothing. A bucket that lands on a UTC midnight — which every day, month
 * and year bucket does — is named by its date alone, since the zeroes below it
 * carry no information.
 */
function groupTitle(key: number | string): string {
  if (
    typeof key !== "number" ||
    !Number.isInteger(key) ||
    key < BUCKET_EPOCH_FIRST ||
    key > BUCKET_EPOCH_LAST
  ) {
    return String(key);
  }
  const instant = new Date(key).toISOString();
  return key % MS_PER_DAY === 0
    ? instant.slice(0, ISO_DATE_END)
    : instant.slice(0, ISO_MINUTE_END).replace("T", " ");
}

function measuredByGroup(points: SeriesPoint[]): Map<string, number> {
  const byGroup = new Map<string, number>();
  for (const point of points) {
    if (point.y !== null) {
      byGroup.set(String(point.x), point.y);
    }
  }
  return byGroup;
}

function topListEntry(
  point: SeriesPoint,
  value: number,
  before: Map<string, number>,
): TopListEntry {
  const entry: TopListEntry = {
    id: point.x,
    title: groupTitle(point.x),
    value,
  };
  const previous = before.get(String(point.x));
  const delta = previous === undefined ? undefined : variation(value, previous);
  if (delta !== undefined) {
    entry.delta = delta;
  }
  return entry;
}

/**
 * Points as a ranked list reads them, each group an entry.
 *
 * A group with nothing measured in it has no place in a ranking: entered as a
 * zero it would outrank every real loss, so it is left out.
 */
export function topListData(
  points: SeriesPoint[],
  options: SeriesOptions,
): TopListData {
  const before = measuredByGroup(options.previous ?? []);
  return {
    items: points.flatMap((point) =>
      point.y === null ? [] : [topListEntry(point, point.y, before)],
    ),
  };
}
