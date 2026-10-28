import type { NotificationTone } from "@antelopejs/interface-dms/notifications/types";

/**
 * At or below this many backup codes left, the alert asks for new ones: the
 * sign-in notification and the Security page agree on it.
 */
export const LOW_BACKUP_CODES = 3;

/**
 * Running low on backup codes is a risk to act on now: the alert turns from
 * a warning into an error.
 *
 * @param left Backup codes still unused after the sign-in
 */
export function backupCodeUsedTone(left: number): NotificationTone {
  return left <= LOW_BACKUP_CODES ? "error" : "warning";
}

/**
 * A member left without any role has lost access: a warning. Any other
 * change of roles is plain information.
 *
 * @param roleCount Roles the member holds after the change
 */
export function rolesChangedTone(roleCount: number): NotificationTone {
  return roleCount === 0 ? "warning" : "neutral";
}

/**
 * The tone a notification is listed with, its icon well's: the sender's, or
 * for an untoned one `primary` while unread and `neutral` once read. The
 * unread badge takes the strongest tone of the unread rows through this, and
 * the inbox mirrors it (`notificationDisplay.ts`), so both agree.
 *
 * @param tone The tone the row stores, null when the sender set none
 * @param isRead Whether the row is read
 */
export function resolveNotificationTone(
  tone: NotificationTone | null | undefined,
  isRead: boolean,
): NotificationTone {
  return tone ?? (isRead ? "neutral" : "primary");
}
