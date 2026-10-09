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
