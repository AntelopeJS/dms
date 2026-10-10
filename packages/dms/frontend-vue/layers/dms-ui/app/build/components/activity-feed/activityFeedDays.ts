import {
  regionalDateTimeFormat,
  regionalDayKey,
  regionalDayNumber,
} from "#dms-core/app/utils/regional";
import type {
  BlockText,
  ComposedTextParam,
} from "#dms-core/app/types/composed-text";
import type { Tone } from "../../../types/tone";

/** One entry of an activity feed, as a page declares it or a source answers. */
export interface ActivityFeedItem {
  id?: string;
  icon?: string;
  tone?: Tone;
  /** Title (i18n key with `$`, literal, or composed text). */
  title: BlockText;
  /** Dimmed details, joined by "·". */
  meta?: BlockText[];
  /**
   * Values the `$` title and details interpolate: typed values are formatted
   * as in a composed text; a `$`-prefixed string is translated first.
   */
  params?: Record<string, ComposedTextParam>;
  /** ISO date: files the entry under its day and gives its time. */
  date?: string;
  /** Trailing text, in place of the formatted time. */
  time?: BlockText;
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

/** Calendar days from `date` to `now`, counted in the reader's time zone. */
export function calendarDaysAgo(date: Date, now: Date): number {
  return regionalDayNumber(now) - regionalDayNumber(date);
}

/** The short date of a day ("Sep 29"), with its year when not this year's. */
export function formatShortDate(date: Date, now: Date, locale: string): string {
  const sameYear =
    regionalDayKey(date).slice(0, YEAR_KEY_LENGTH) ===
    regionalDayKey(now).slice(0, YEAR_KEY_LENGTH);
  return regionalDateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

/** How far back a day is, in the coarse buckets of a feed. */
export type RelativeDayBucket = "today" | "week" | "older";

/** Today, earlier this week (the last seven days), or older. */
export function relativeDayBucket(date: Date, now: Date): RelativeDayBucket {
  const daysAgo = calendarDaysAgo(date, now);
  if (daysAgo <= 0) return "today";
  if (daysAgo < WEEK_DAYS) return "week";
  return "older";
}

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
  const daysAgo = calendarDaysAgo(date, now);
  const shortDate = formatShortDate(date, now, locale);
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

const isTextKey = (value: ComposedTextParam): value is string =>
  typeof value === "string" && value.startsWith("$");

/**
 * The values an entry's title and details interpolate, as composed-text
 * parameters. A `$` string is a text of its own, written with the entry's
 * other values: "Signed in on {device}" with `device` = "{browser} on {os}".
 */
export function resolveActivityParams(
  params: Record<string, ComposedTextParam> | undefined,
): Record<string, ComposedTextParam> | undefined {
  if (!params) return undefined;
  const entries = Object.entries(params);
  const values = Object.fromEntries(
    entries.filter(([, value]) => !isTextKey(value)),
  );
  return Object.fromEntries(
    entries.map(([name, value]) => [
      name,
      isTextKey(value) ? { key: value, params: values } : value,
    ]),
  );
}

/**
 * A title or a detail of an entry as the text to write: a `$` key takes the
 * entry's values, so a `count` value picks its plural form; a composed text
 * carries its own values, and a literal is written as is.
 */
export function activityText(
  text: BlockText,
  params: Record<string, ComposedTextParam> | undefined,
): BlockText {
  if (!isTextKey(text)) return text;
  return { key: text, params: resolveActivityParams(params) };
}
