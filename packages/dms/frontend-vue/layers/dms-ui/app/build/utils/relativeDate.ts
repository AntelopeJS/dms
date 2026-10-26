import { formatRelativeDistance } from "#dms-core/app/utils/formatter";
import { regionalDateTimeFormat } from "#dms-core/app/utils/regional";

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
  return capitalize(
    formatRelativeDistance(date, locale, { style: "short", now }),
  );
}

const DAY_MONTH_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};
const YEAR_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric" };

/**
 * "Sep 27": day and short month, read against `now`; a date of another year
 * ("Apr 2, 2018") names its year as well.
 */
export function formatDayMonth(
  date: string | number | Date,
  locale: string,
  now: number = Date.now(),
): string {
  const day = new Date(date);

  const year = regionalDateTimeFormat(locale, YEAR_FORMAT);
  const isOtherYear = year.format(day) !== year.format(now);
  return regionalDateTimeFormat(
    locale,
    isOtherYear ? { ...DAY_MONTH_FORMAT, ...YEAR_FORMAT } : DAY_MONTH_FORMAT,
  ).format(day);
}

/** First word of a name, for "Sep 27 · by Camille". */
export function firstNameOf(name: unknown): string {
  return typeof name === "string" ? (name.trim().split(/\s+/)[0] ?? "") : "";
}
