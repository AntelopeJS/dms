import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";

/**
 * A notification without a title renders as an empty row in the inbox. The
 * builder's types require one, but a caller passing a request body straight
 * through can still hand an empty string or null.
 */
export function hasNotificationTitle(
  data: Pick<NotificationData, "title">,
): boolean {
  return typeof data.title === "string" && data.title.trim().length > 0;
}
