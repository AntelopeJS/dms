import {
  regionalDateTimeFormat,
  regionalDayKey,
  regionalDayNumber,
} from "#dms-core/app/utils/regional";
import type { DmsTone } from "../../utils/tone";

/** One entry of an activity feed, as a page declares it or a source answers. */
export interface ActivityFeedItem {
  id?: string;
  icon?: string;
  tone?: DmsTone;
  /** Title (i18n key with `$` or literal). */
  title: string;
  /** Dimmed details, joined by "·". */
  meta?: string[];
  /**
   * Values the title and the details interpolate; a `$`-prefixed value is
   * translated first.
   */
  params?: Record<string, string>;
  /** ISO date: files the entry under its day and gives its time. */
  date?: string;
  /** Literal trailing text, in place of the formatted time. */
  time?: string;
  unread?: boolean;
  /** Makes the row a link. */
  to?: string;
}

/** A run of entries sharing one calendar day, newest first. */
export interface ActivityFeedDay {
  /** `YYYY-MM-DD`, or `undated` for entries without a date. */
  key: string;
  /** "Today", "Yesterday", a weekday within the week, else the date. */
  name?: string;
  /** The short date after the name ("Sep 29"); absent when the name is it. */
  date?: string;
  items: ActivityFeedItem[];
}

export interface ActivityFeedDayLabels {
  today: string;
  yesterday: string;
}

const WEEK_DAYS = 7;
const UNDATED_KEY = "undated";
const YEAR_KEY_LENGTH = 4;

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

/**
 * How a calendar day reads next to today: "Today", "Yesterday", a weekday
 * within the week, else the short date — with the short date beside a name.
 */
export function nameCalendarDay(
  date: Date,
  now: Date,
  locale: string,
  labels: ActivityFeedDayLabels,
): Pick<ActivityFeedDay, "name" | "date"> {
  // Days and years are counted in the reader's time zone.
  const daysAgo = regionalDayNumber(now) - regionalDayNumber(date);
  const sameYear =
    regionalDayKey(date).slice(0, YEAR_KEY_LENGTH) ===
    regionalDayKey(now).slice(0, YEAR_KEY_LENGTH);
  const shortDate = regionalDateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
  if (daysAgo === 0) return { name: labels.today, date: shortDate };
  if (daysAgo === 1) return { name: labels.yesterday, date: shortDate };
  if (daysAgo > 1 && daysAgo < WEEK_DAYS) {
    const weekday = regionalDateTimeFormat(locale, {
      weekday: "long",
    }).format(date);
    return {
      name: weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1),
      date: shortDate,
    };
  }
  return { name: shortDate };
}

/**
 * Splits a newest-first feed into calendar days, keeping the feed order.
 * Entries without a valid date are gathered last, under no heading.
 */
export function groupActivityByDay(
  items: ActivityFeedItem[],
  locale: string,
  labels: ActivityFeedDayLabels,
  now: Date = new Date(),
): ActivityFeedDay[] {
  const days = new Map<string, ActivityFeedDay>();
  for (const item of items) {
    const date = item.date ? new Date(item.date) : null;
    const key = date && isValidDate(date) ? regionalDayKey(date) : UNDATED_KEY;
    let day = days.get(key);
    if (!day) {
      day =
        key === UNDATED_KEY || !date
          ? { key, items: [] }
          : { key, ...nameCalendarDay(date, now, locale, labels), items: [] };
      days.set(key, day);
    }
    day.items.push(item);
  }
  const dated = [...days.values()].filter((day) => day.key !== UNDATED_KEY);
  const undated = days.get(UNDATED_KEY);
  return undated ? [...dated, undated] : dated;
}

/** Hour and minute of an entry, in the reader's locale ("09:42"). */
export function formatActivityTime(date: string, locale: string): string {
  const parsed = new Date(date);
  if (!isValidDate(parsed)) return "";
  return regionalDateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

type ActivityTranslate = (
  key: string,
  params?: Record<string, string> | null,
) => string;

const isTextKey = (value: string): boolean => value.startsWith("$");

/**
 * The values an entry's title and details interpolate. A `$` value is a text
 * of its own, translated with the entry's literal values: "Signed in on
 * {device}" with `device` = "{browser} on {os}".
 */
export function resolveActivityParams(
  params: Record<string, string> | undefined,
  translate: ActivityTranslate,
): Record<string, string> | null {
  if (!params) return null;
  const entries = Object.entries(params);
  const literals = Object.fromEntries(
    entries.filter(([, value]) => !isTextKey(value)),
  );
  return Object.fromEntries(
    entries.map(([name, value]) => [
      name,
      isTextKey(value) ? translate(value, literals) : value,
    ]),
  );
}
