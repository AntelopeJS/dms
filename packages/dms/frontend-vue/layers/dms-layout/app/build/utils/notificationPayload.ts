import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "#dms-core/app/utils/type-check";
import type {
  FeedCounts,
  NotificationTone,
  UserNotification,
} from "../../composables/notification/useNotifications";

const NOTIFICATION_TONES: readonly NotificationTone[] = [
  "neutral",
  "primary",
  "success",
  "warning",
  "error",
];

const NOTIFICATION_TEXT_FIELDS = [
  "_id",
  "userId",
  "icon",
  "title",
  "description",
  "categoryId",
  "createdAt",
  "updatedAt",
] as const satisfies readonly (keyof UserNotification)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && isObject(value);
}

function isNotificationTone(value: unknown): value is NotificationTone {
  return NOTIFICATION_TONES.some((tone) => tone === value);
}

function isNotificationParams(
  value: unknown,
): value is UserNotification["params"] {
  return (
    value === null ||
    (isRecord(value) &&
      Object.values(value).every((param) => isString(param) || isNumber(param)))
  );
}

/** Whether `value` is a notification as the backend sends it. */
export function isUserNotification(value: unknown): value is UserNotification {
  return (
    isRecord(value) &&
    NOTIFICATION_TEXT_FIELDS.every((field) => isString(value[field])) &&
    isBoolean(value.isRead) &&
    (value.linkTo === null || isString(value.linkTo)) &&
    isNotificationParams(value.params) &&
    (value.subjectId === undefined || isString(value.subjectId)) &&
    (value.tone === undefined ||
      value.tone === null ||
      isNotificationTone(value.tone))
  );
}

/** Whether `value` is a list of notification ids. */
export function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => isString(id));
}

/** The feed's counts an event carries, or undefined when it carries none. */
export function feedCountsOf(value: unknown): FeedCounts | undefined {
  if (!isRecord(value)) return undefined;
  const { all, unread, unreadTone } = value;
  if (!isNumber(all) || !isNumber(unread)) return undefined;
  if (unreadTone === undefined) return { all, unread };
  return isNotificationTone(unreadTone)
    ? { all, unread, unreadTone }
    : undefined;
}
