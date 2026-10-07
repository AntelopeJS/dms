import type { User } from "@antelopejs/interface-dms/auth/db";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base/key-value-list";
import { getTwoFactorStatus } from "../users/two-factor-operations";
import { loadProfileAccess } from "../users/profile-access";

const TEXTS = "$page.settings.overview";

/** What a list block's `fetchUrl` answers. */
export interface BlockItems<T> {
  items: T[];
}

/** The label of a two-factor method the user turned on. */
const METHOD_LABELS: Record<string, string> = {
  totp: `${TEXTS}.activity.method.totp`,
  email: `${TEXTS}.activity.method.email`,
};

/** The user's language, named in itself: "Français", "English". */
export function languageName(language: string): string {
  const name =
    new Intl.DisplayNames([language], { type: "language" }).of(language) ??
    language;
  return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
}

function twoFactorItem(user: User): KeyValueListItem {
  const { methods } = getTwoFactorStatus(user);
  const isOn = methods.length > 0;
  return {
    id: "two-factor",
    label: `${TEXTS}.two_factor`,
    type: "status",
    value: isOn ? `${TEXTS}.two_factor_on_short` : `${TEXTS}.two_factor_off`,
    tone: isOn ? "success" : "warning",
    detail: methods.length === 1 ? METHOD_LABELS[methods[0] ?? ""] : undefined,
  };
}

function backupCodesItem(user: User): KeyValueListItem {
  const { hasBackupCodes } = getTwoFactorStatus(user);
  return {
    id: "backup-codes",
    label: `${TEXTS}.backup_codes`,
    value: hasBackupCodes
      ? `${TEXTS}.backup_codes_ready`
      : `${TEXTS}.backup_codes_missing`,
    tone: hasBackupCodes ? undefined : "warning",
  };
}

/**
 * The "Your account" card of the settings overview: who the signed-in user
 * is in this workspace and how their sign-in is protected.
 */
export async function loadAccountSummary(
  user: User,
  tenantId: string,
): Promise<BlockItems<KeyValueListItem>> {
  const access = await loadProfileAccess(user, tenantId);
  const isOwner = access.workspaceOwner || access.platformOwner;
  return {
    items: [
      { id: "name", label: `${TEXTS}.name`, value: user.name },
      { id: "email", label: `${TEXTS}.email`, value: user.email, type: "mono" },
      {
        id: "role",
        label: `${TEXTS}.role`,
        type: "status",
        value: isOwner ? `${TEXTS}.owner` : `${TEXTS}.member`,
        tone: isOwner ? "primary" : "neutral",
      },
      twoFactorItem(user),
      backupCodesItem(user),
      {
        id: "language",
        label: `${TEXTS}.language`,
        value: user.language ? languageName(user.language) : null,
      },
    ],
  };
}
