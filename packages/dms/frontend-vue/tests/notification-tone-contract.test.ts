import { expect, it } from "vitest";
import { resolveNotificationTone as resolveOnServer } from "../../src/utils/notification-tones";
import { resolveNotificationTone as resolveInInbox } from "../layers/dms-layout/app/build/components/pages/settings/notification/notificationDisplay";
import type {
  NotificationTone,
  UserNotification,
} from "../layers/dms-layout/app/composables/notification/useNotifications";

// The server weighs the unread badge (the bell, the Notifications entry) with
// the tone the inbox draws each notification in: the two never disagree.

const STORED_TONES: Array<NotificationTone | null> = [
  null,
  "neutral",
  "primary",
  "success",
  "warning",
  "error",
];

const row = (
  tone: NotificationTone | null,
  isRead: boolean,
): UserNotification => ({
  _id: "n1",
  userId: "u1",
  icon: "i-ph-bell",
  title: "",
  description: "",
  params: null,
  linkTo: null,
  isRead,
  categoryId: "system",
  tone,
  createdAt: "2026-10-09T10:00:00.000Z",
  updatedAt: "2026-10-09T10:00:00.000Z",
});

it("resolves every stored tone, read or not, as the server does", () => {
  for (const tone of STORED_TONES) {
    for (const isRead of [false, true]) {
      expect(resolveInInbox(row(tone, isRead)), `${tone}/${isRead}`).toBe(
        resolveOnServer(tone, isRead),
      );
    }
  }
});

it("draws an untoned unread notification in primary", () => {
  expect(resolveInInbox(row(null, false))).toBe("primary");
});
