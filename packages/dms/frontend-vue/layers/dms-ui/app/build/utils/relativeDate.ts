import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

interface RelativeUnit {
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
  /** The unit applies below this elapsed time. */
  below: number;
}

const RELATIVE_UNITS: RelativeUnit[] = [
  { unit: "minute", ms: MINUTE_MS, below: HOUR_MS },
  { unit: "hour", ms: HOUR_MS, below: DAY_MS },
  { unit: "day", ms: DAY_MS, below: WEEK_MS },
  { unit: "week", ms: WEEK_MS, below: MONTH_MS },
  { unit: "month", ms: MONTH_MS, below: YEAR_MS },
  { unit: "year", ms: YEAR_MS, below: Number.POSITIVE_INFINITY },
];

function capitalize(text: string): string {
  return text ? `${text[0]!.toLocaleUpperCase()}${text.slice(1)}` : text;
}

/**
 * "2 hr. ago", "Yesterday", "In 5 days": the distance between `date` and
 * `now`, in the largest unit that keeps it a whole number, past or future.
 */
export function formatRelativeDate(
  date: string | number | Date,
  locale: string,
  now: number = Date.now(),
): string {
  const deltaMs = new Date(date).getTime() - now;
  const distance = Math.abs(deltaMs);
  const unit =
    RELATIVE_UNITS.find((candidate) => distance < candidate.below) ??
    RELATIVE_UNITS[RELATIVE_UNITS.length - 1]!;
  const value = Math.round(deltaMs / unit.ms);
  const format = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  });
  return capitalize(format.format(value, unit.unit));
}

/** "Sep 27": day and short month. */
export function formatDayMonth(
  date: string | number | Date,
  locale: string,
): string {
  return regionalDateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

/** First word of a name, for "Sep 27 · by Camille". */
export function firstNameOf(name: unknown): string {
  return typeof name === "string" ? (name.trim().split(/\s+/)[0] ?? "") : "";
}
