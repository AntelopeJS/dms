import { describe, expect, it } from "vitest";
import { resolveNotificationTone as resolveOnServer } from "../../src/utils/notification-tones";
import {
  resolveNotificationTone as resolveInInbox,
  unreadToneWith,
} from "../layers/dms-layout/app/build/components/pages/settings/notification/notificationDisplay";
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

describe("the unread badge's tone when a notification arrives", () => {
  it("takes the stronger of the current tone and the new notification's", () => {
    expect(unreadToneWith("warning", row("error", false))).toBe("error");
    expect(unreadToneWith("error", row("success", false))).toBe("error");
    expect(unreadToneWith("success", row(null, false))).toBe("primary");
  });

  it("takes the new notification's tone when nothing was unread", () => {
    expect(unreadToneWith(undefined, row("warning", false))).toBe("warning");
  });

  it("keeps the current tone for a notification that arrives read", () => {
    expect(unreadToneWith("success", row("error", true))).toBe("success");
  });
});
