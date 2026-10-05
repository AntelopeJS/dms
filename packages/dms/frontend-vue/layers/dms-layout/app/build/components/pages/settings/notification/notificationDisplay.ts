import {
  regionalDateTimeFormat,
  regionalDayKey,
  regionalDayNumber,
} from "#dms-core/app/utils/regional";
import type {
  NotificationTone,
  UserNotification,
} from "../../../../../composables/notification/useNotifications";

/** Notifications without a tone stand out in `primary` until read. */
export const resolveNotificationTone = (
  notification: UserNotification,
): NotificationTone =>
  notification.tone ?? (notification.isRead ? "neutral" : "primary");

/** Inbox sections, newest first. */
export type NotificationDayGroupKey = "today" | "week" | "older";

export interface NotificationDayGroup {
  key: NotificationDayGroupKey;
  items: UserNotification[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_DAYS = 7;
const YEAR_KEY_LENGTH = 4;
const DAY_GROUP_ORDER: NotificationDayGroupKey[] = ["today", "week", "older"];

// Days are counted in the reader's time zone.
const dayGroupOf = (
  createdAt: string,
  today: number,
): NotificationDayGroupKey => {
  const daysAgo = today - regionalDayNumber(new Date(createdAt));
  if (daysAgo <= 0) return "today";
  if (daysAgo < WEEK_DAYS) return "week";
  return "older";
};

/** Splits a newest-first feed into Today, Earlier this week and Older. */
export const groupNotificationsByDay = (
  items: UserNotification[],
  now = new Date(),
): NotificationDayGroup[] => {
  const today = regionalDayNumber(now);
  const buckets = new Map<NotificationDayGroupKey, UserNotification[]>();
  for (const item of items) {
    const key = dayGroupOf(item.createdAt, today);
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }
  return DAY_GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    items: buckets.get(key) ?? [],
  }));
};

/** Mono time stamp: relative within a day, then a short date. */
export const formatNotificationTime = (
  createdAt: string,
  locale: string,
  formatRecent: (date: string) => string,
  now = new Date(),
): string => {
  const date = new Date(createdAt);
  if (now.getTime() - date.getTime() < DAY_MS) return formatRecent(createdAt);
  const sameYear =
    regionalDayKey(date).slice(0, YEAR_KEY_LENGTH) ===
    regionalDayKey(now).slice(0, YEAR_KEY_LENGTH);
  return regionalDateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
};

/**
 * The matrix lays out from its own width (`@container/matrix` on the table),
 * not the viewport's: the settings column at 1024px is narrower than a phone
 * in landscape, and four fixed columns left the subject about 50px there.
 */
export const MATRIX_CONTAINER_CLASS = "@container/matrix";

/**
 * v2 .cs-matrix grid: subject, in-app, email, state. Under 672px of matrix
 * the state column goes; under 448px (phones) only the subject and in-app
 * columns remain.
 */
export const MATRIX_GRID_CLASS =
  "grid grid-cols-[minmax(0,1fr)_80px_96px_168px] items-center gap-x-3 px-[18px] @max-2xl/matrix:grid-cols-[minmax(0,1fr)_80px_96px] @max-2xl/matrix:[&>:nth-child(4)]:hidden @max-md/matrix:grid-cols-[minmax(0,1fr)_60px] @max-md/matrix:[&>:nth-child(n+3)]:hidden";

/** The subject's indent under its category, dropped where only two columns remain. */
export const MATRIX_SUBJECT_INDENT_CLASS = "pl-[42px] @max-md/matrix:pl-0";

/** v2 .cs-mod: the mono module / source tag. */
export const SOURCE_TAG_CLASS =
  "inline-flex h-[18px] items-center rounded-[4px] border border-accented px-1.5 font-mono text-[9.5px] font-semibold tracking-[0.08em] whitespace-nowrap text-muted uppercase";

export const MODULE_TAG_CLASS =
  "border-(--dms-accent-line) bg-(--dms-accent-tint) text-primary";

/** Where a notification comes from, shown as a mono tag. */
export interface NotificationSourceTag {
  label: string;
  /** A module's own tag (`SaaS`), drawn in the accent. */
  isModule: boolean;
}
