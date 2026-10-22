import type { ChartSeries } from "./types";
import type { UseApexChartInput } from "./useApexChart.types";

/** The calendar step a series of dates moves by. */
export type CalendarBucket = "month" | "day";

/** How a bucket's dates are written: on the axis, then in the tooltip. */
interface BucketFormats {
  /** ApexCharts tokens, as its own datetime axis writes them. */
  axis: string;
  /** Intl options, for the tooltip and wherever Apex lends no formatter. */
  axisIntl: Intl.DateTimeFormatOptions;
  tooltipIntl: Intl.DateTimeFormatOptions;
}

const BUCKET_FORMATS: Record<CalendarBucket, BucketFormats> = {
  month: {
    axis: "MMM 'yy",
    axisIntl: { month: "short", year: "2-digit" },
    tooltipIntl: { month: "long", year: "numeric" },
  },
  day: {
    axis: "dd MMM",
    axisIntl: { day: "2-digit", month: "short" },
    tooltipIntl: { day: "numeric", month: "short", year: "numeric" },
  },
};

/** Beyond this many buckets the datetime axis thins its own labels better. */
const MAX_BUCKETS = 120;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const BUCKETED_TYPES = new Set(["column"]);

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

type ApexDateFormatter = (date: Date, format: string) => string;

/** What Apex hands an axis label formatter, past the value. */
interface ApexLabelOptions {
  dateFormatter?: ApexDateFormatter;
  w?: unknown;
}

/** A column chart's dates turned into one category per calendar bucket. */
export interface DatetimeBuckets {
  bucket: CalendarBucket;
  /** Every bucket from the first date to the last, as `YYYY-MM-DD`. */
  keys: string[];
  /**
   * Per series, the index in the route's `data` of the point in each bucket,
   * `-1` for an empty bucket: a click names the point the route sent.
   */
  sourceIndexes: number[][];
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function keyOf(day: CalendarDay): string {
  return `${day.year}-${pad(day.month)}-${pad(day.day)}`;
}

function dateOfKey(key: string): Date {
  const [, year, month, day] = DATE_ONLY.exec(key)!;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function localDay(date: Date): CalendarDay | null {
  const isMidnight =
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
  if (!isMidnight) return null;
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function utcDay(date: Date): CalendarDay | null {
  const isMidnight =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0;
  if (!isMidnight) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * The calendar day a point stands for. A date-only string is that day; a
 * timestamp counts when it falls on a midnight, the browser's or UTC's: a
 * route bucketing by month often sends `2026-10-01T00:00:00Z`.
 */
function calendarDayOf(
  x: unknown,
  readDay: typeof localDay,
): CalendarDay | null {
  if (typeof x === "string") {
    const match = DATE_ONLY.exec(x);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }
  }
  if (typeof x !== "string" && typeof x !== "number" && !(x instanceof Date)) {
    return null;
  }
  const date = new Date(x);
  return Number.isNaN(date.getTime()) ? null : readDay(date);
}

function pointX(point: ChartSeries["data"][number]): unknown {
  return typeof point === "object" && point !== null ? point.x : undefined;
}

/** Each series' days, in order, or `null` when a point is not a day. */
function readDays(
  series: ChartSeries[],
  readDay: typeof localDay,
): CalendarDay[][] | null {
  const days: CalendarDay[][] = [];
  for (const entry of series) {
    const seriesDays: CalendarDay[] = [];
    for (const point of entry.data) {
      const day = calendarDayOf(pointX(point), readDay);
      if (!day) return null;
      seriesDays.push(day);
    }
    days.push(seriesDays);
  }
  return days.some((entry) => entry.length > 0) ? days : null;
}

function nextBucket(day: CalendarDay, bucket: CalendarBucket): CalendarDay {
  const date =
    bucket === "month"
      ? new Date(day.year, day.month, 1)
      : new Date(day.year, day.month - 1, day.day + 1);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

/** Every bucket from `first` to `last`, or `null` past the bucket cap. */
function bucketKeys(
  first: string,
  last: string,
  bucket: CalendarBucket,
): string[] | null {
  const keys: string[] = [];
  let cursor = calendarDayOf(first, localDay)!;
  while (keyOf(cursor) <= last) {
    keys.push(keyOf(cursor));
    if (keys.length > MAX_BUCKETS) return null;
    cursor = nextBucket(cursor, bucket);
  }
  return keys;
}

/**
 * Where each series' points fall among `keys`, or `null` when a series holds
 * two points in one bucket or a date between buckets (the 15th on a monthly
 * axis): those keep the datetime axis.
 */
function sourceIndexesOf(
  days: CalendarDay[][],
  keys: string[],
): number[][] | null {
  const positions = new Map(keys.map((key, position) => [key, position]));
  const indexes: number[][] = [];
  for (const seriesDays of days) {
    const slots = keys.map(() => -1);
    for (const [index, day] of seriesDays.entries()) {
      const position = positions.get(keyOf(day));
      if (position === undefined || slots[position] !== -1) return null;
      slots[position] = index;
    }
    indexes.push(slots);
  }
  return indexes;
}

/**
 * Whether two dates sit one bucket apart somewhere: weekly or quarterly
 * points have none, and the datetime axis spaces them better than buckets
 * mostly left empty.
 */
function hasAdjacentBuckets(sourceIndexes: number[][]): boolean {
  return sourceIndexes.some((slots) =>
    slots.some(
      (index, position) =>
        index !== -1 &&
        slots[position + 1] !== undefined &&
        slots[position + 1] !== -1,
    ),
  );
}

function layoutBuckets(
  days: CalendarDay[][],
  bucket: CalendarBucket,
): DatetimeBuckets | null {
  const sorted = days.flat().map(keyOf).sort();
  const keys = bucketKeys(sorted[0]!, sorted.at(-1)!, bucket);
  if (!keys) return null;
  const sourceIndexes = sourceIndexesOf(days, keys);
  if (!sourceIndexes) return null;
  const isSingleBucket = keys.length === 1;
  if (!isSingleBucket && !hasAdjacentBuckets(sourceIndexes)) return null;
  return { bucket, keys, sourceIndexes };
}

/**
 * Whether a column chart on a datetime axis plots calendar buckets — every
 * point on a day, or on the first of a month — and which ones. Apex places
 * such columns by time and ticks the axis on its own: months of uneven length
 * leave uneven gaps, and a tick every half month repeats each month's name.
 */
export function detectDatetimeBuckets(
  input: UseApexChartInput,
): DatetimeBuckets | null {
  if (input.xaxisType !== "datetime") return null;
  if (!BUCKETED_TYPES.has(input.type)) return null;
  const days =
    readDays(input.series, localDay) ?? readDays(input.series, utcDay);
  if (!days) return null;
  const bucket: CalendarBucket = days.flat().every((day) => day.day === 1)
    ? "month"
    : "day";
  return layoutBuckets(days, bucket);
}

/**
 * The series on the bucket axis: one point per bucket, named by it, an empty
 * bucket holding `null` so it keeps its slot.
 */
export function toBucketSeries(
  series: ChartSeries[],
  buckets: DatetimeBuckets,
): ChartSeries[] {
  return series.map((entry, seriesIndex) => ({
    ...entry,
    data: buckets.keys.map((key, position) => {
      const point = entry.data[buckets.sourceIndexes[seriesIndex]![position]!];
      return typeof point === "object"
        ? { ...point, x: key }
        : { x: key, y: null };
    }),
  }));
}

function intlFormat(
  key: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(dateOfKey(key));
}

/**
 * The axis label of a bucket: in Apex's own tokens (`xAxis.datetimeFormat`,
 * else what its datetime axis writes for that step) when Apex lends its
 * formatter, which speaks the chart's locale, else through Intl.
 */
export function bucketAxisFormatter(
  buckets: DatetimeBuckets,
  input: UseApexChartInput,
): (value: string, timestamp?: unknown, opts?: ApexLabelOptions) => string {
  const formats = BUCKET_FORMATS[buckets.bucket];
  return (value, _timestamp, opts) => {
    if (!DATE_ONLY.test(String(value))) return String(value ?? "");
    if (input.xAxisFormatter) {
      return input.xAxisFormatter(value, dateOfKey(value).getTime());
    }
    if (opts?.dateFormatter && opts.w) {
      const format = input.xAxis?.datetimeFormat ?? formats.axis;
      return opts.dateFormatter.call({ w: opts.w }, dateOfKey(value), format);
    }
    return intlFormat(value, input.locale, formats.axisIntl);
  };
}

/** The tooltip title of a bucket: the whole month, or the whole day. */
export function bucketTooltipFormatter(
  buckets: DatetimeBuckets,
  input: UseApexChartInput,
): (value: string) => string {
  const formats = BUCKET_FORMATS[buckets.bucket];
  return (value) =>
    DATE_ONLY.test(String(value))
      ? intlFormat(value, input.locale, formats.tooltipIntl)
      : String(value ?? "");
}
