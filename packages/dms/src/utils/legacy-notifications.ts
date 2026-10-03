// Stored notifications written before their texts were rewritten carry the
// params and descriptions of the old texts. Pure: the runner
// (notification-upgrade.ts) reads and writes the rows.

/**
 * Version of the stored notification params; bump it with a new upgrade step.
 * 2: version 1 wrote the new descriptions through an update, which stored
 * null; the steps now derive the description from the params every time.
 */
export const NOTIFICATIONS_DATA_VERSION = 2;

const MESSAGE_PREFIX = "$dms.notifications.messages.";
const MESSAGE_ID = /^\$dms\.notifications\.messages\.([a-z0-9_]+)\.title/;
// The old sign-in alerts appended the IP to the device as " (ip)".
const LEGACY_ORIGIN = /^\s*\(([^)]*)\)\s*$/;
const SIGN_IN_MESSAGES = new Set(["new_login", "new_login_unknown_device"]);
const PASSWORD_RESET_MESSAGE = "password_reset";
const BACKUP_CODES_MESSAGE = "backup_codes_regenerated";
const BACKUP_COUNT_VARIANTS: Readonly<Record<number, string>> = {
  0: "description_none",
  1: "description_one",
};

type NotificationParams = Record<string, string | number>;

/** The fields of a stored notification the upgrade reads. */
export interface StoredNotification {
  title: string;
  description?: string | null;
  params: NotificationParams | null;
}

/** What to write back to bring a stored notification to the current texts. */
export interface NotificationPatch {
  description?: string;
  params?: NotificationParams;
}

function messageIdOf(row: StoredNotification): string | undefined {
  return MESSAGE_ID.exec(row.title ?? "")?.[1];
}

function descriptionKey(messageId: string, variant: string): string {
  return `${MESSAGE_PREFIX}${messageId}.${variant}`;
}

/** The patch, or undefined when it changes nothing. */
function changed(
  row: StoredNotification,
  patch: NotificationPatch,
): NotificationPatch | undefined {
  const keepsDescription =
    patch.description === undefined || patch.description === row.description;
  return keepsDescription && patch.params === undefined ? undefined : patch;
}

function upgradeSignIn(
  row: StoredNotification,
  messageId: string,
): NotificationPatch | undefined {
  const { origin, ...rest } = row.params ?? {};
  const legacyIp =
    origin === undefined
      ? undefined
      : LEGACY_ORIGIN.exec(String(origin))?.[1]?.trim();
  const params = legacyIp ? { ...rest, ip: legacyIp } : rest;
  const variant = params.ip ? "description" : "description_no_ip";
  const patch: NotificationPatch = {
    description: descriptionKey(messageId, variant),
  };
  // Only a legacy row has params to rewrite; a current one keeps its own.
  if (origin !== undefined) patch.params = params;
  return changed(row, patch);
}

function upgradeBackupCodes(
  row: StoredNotification,
): NotificationPatch | undefined {
  const count = row.params?.count;
  const variant =
    count === undefined
      ? BACKUP_COUNT_VARIANTS[0]
      : (BACKUP_COUNT_VARIANTS[Number(count)] ?? "description");
  return changed(row, {
    description: descriptionKey(BACKUP_CODES_MESSAGE, variant),
  });
}

/** A password reset alert now names the address the link went to. */
export function needsAccountEmail(row: StoredNotification): boolean {
  return messageIdOf(row) === PASSWORD_RESET_MESSAGE && !row.params?.email;
}

/**
 * @param row The stored notification
 * @param accountEmail Address of the account, for a reset alert without one
 * @returns The patch to apply, or undefined when the row is current
 */
export function upgradeLegacyNotification(
  row: StoredNotification,
  accountEmail?: string,
): NotificationPatch | undefined {
  const messageId = messageIdOf(row);
  if (!messageId) return undefined;
  if (SIGN_IN_MESSAGES.has(messageId)) return upgradeSignIn(row, messageId);
  if (messageId === BACKUP_CODES_MESSAGE) return upgradeBackupCodes(row);
  if (needsAccountEmail(row) && accountEmail) {
    return { params: { ...row.params, email: accountEmail } };
  }
  return undefined;
}
