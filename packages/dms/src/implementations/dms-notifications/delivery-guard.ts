import type { NotificationData } from "@antelopejs/interface-dms/notifications/types";

/**
 * A notification without a title renders as an empty row in the inbox. The
 * builder's types require one, but a caller passing a request body straight
 * through can still hand an empty string or null.
 */
export function hasNotificationTitle(
  data: Pick<NotificationData, "title">,
): boolean {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Module callers can forward untyped request data; retain the existing rejection of null and nonstring notification titles.
  return typeof data.title === "string" && data.title.trim().length > 0;
}
