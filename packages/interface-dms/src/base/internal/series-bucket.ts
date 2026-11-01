import type { SeriesBucket } from "../query-response";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const YEAR_STEP = 100;
const MONTHS_PER_YEAR = 12;
const QUARTERS_PER_YEAR = 4;
const QUARTER_STEP = 10;
const FIRST_DAY = 1;
const LAST_DAY = 31;

interface Period {
  year: number;
  /** A month, or a quarter, or a day of month, by the bucket. */
  part: number;
}

function splitStamp(stamp: number, step: number): Period {
  return { year: Math.floor(stamp / step), part: stamp % step };
}

function dayLabel(stamp: number): string | undefined {
  const { year: monthStamp, part: day } = splitStamp(stamp, YEAR_STEP);
  const { year, part: month } = splitStamp(monthStamp, YEAR_STEP);
  const valid =
    month >= 1 &&
    month <= MONTHS_PER_YEAR &&
    day >= FIRST_DAY &&
    day <= LAST_DAY;
  return valid ? `${MONTH_NAMES[month - 1]} ${day}, ${year}` : undefined;
}

function monthLabel(stamp: number): string | undefined {
  const { year, part: month } = splitStamp(stamp, YEAR_STEP);
  return month >= 1 && month <= MONTHS_PER_YEAR
    ? `${MONTH_NAMES[month - 1]} ${year}`
    : undefined;
}

function quarterLabel(stamp: number): string | undefined {
  const { year, part: quarter } = splitStamp(stamp, QUARTER_STEP);
  return quarter >= 1 && quarter <= QUARTERS_PER_YEAR
    ? `Q${quarter} ${year}`
    : undefined;
}

const LABELS: Record<SeriesBucket, (stamp: number) => string | undefined> = {
  day: dayLabel,
  month: monthLabel,
  quarter: quarterLabel,
  year: (stamp) => String(stamp),
};

/**
 * A period stamp as a person reads it: 202608 as "Aug 2026" for a month, 20263 as
 * "Q3 2026", 20260801 as "Aug 1, 2026". A key that is not a stamp of its bucket
 * (a text, a fraction, a month 13) is returned as it came, never guessed at.
 *
 * @internal
 */
export function bucketLabel(
  key: number | string,
  bucket: SeriesBucket,
): number | string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- A group key is a number or a text; only a whole number can be a period stamp.
  if (typeof key !== "number" || !Number.isInteger(key)) {
    return key;
  }
  return LABELS[bucket](key) ?? key;
}
