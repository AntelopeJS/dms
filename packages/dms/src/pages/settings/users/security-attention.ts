import type { NavBadgeCount } from "@antelopejs/interface-dms/component";
import type { NotificationTone } from "@antelopejs/interface-dms/notifications/types";
import { combineNavBadgeCounts } from "@antelopejs/interface-dms/page/internal/nav-badges";
import { LOW_BACKUP_CODES } from "../../../utils/notification-tones";
import type { TwoFactorStatus } from "./two-factor-operations";

/** Something on the Security page that needs the user's attention. */
export type SecurityAttention =
  | "two_factor_off"
  | "backup_codes_unsaved"
  | "backup_codes_low";

/**
 * An attention item and the tone it weighs with, on the notifications' grid:
 * `error` for a risk to act on now, `warning` for a protection missing.
 */
interface AttentionRule {
  id: SecurityAttention;
  tone: NotificationTone;
  applies: (twoFactor: TwoFactorStatus) => boolean;
}

const isTwoFactorOn = (twoFactor: TwoFactorStatus): boolean =>
  twoFactor.methods.length > 0;

/**
 * Most important first. Codes generated before the "saved" stamp existed
 * carry no generation date; they are not flagged, since nothing tells whether
 * they were kept.
 */
const ATTENTION_RULES: AttentionRule[] = [
  {
    id: "two_factor_off",
    tone: "warning",
    applies: (twoFactor) => !isTwoFactorOn(twoFactor),
  },
  // Running out of codes can lock the user out at the next lost device.
  {
    id: "backup_codes_low",
    tone: "error",
    applies: (twoFactor) =>
      isTwoFactorOn(twoFactor) && twoFactor.backupCodesLeft <= LOW_BACKUP_CODES,
  },
  {
    id: "backup_codes_unsaved",
    tone: "warning",
    applies: (twoFactor) =>
      twoFactor.hasBackupCodes &&
      !!twoFactor.backupCodesGeneratedAt &&
      !twoFactor.backupCodesSavedAt,
  },
];

const applyingRules = (twoFactor: TwoFactorStatus): AttentionRule[] =>
  ATTENTION_RULES.filter((rule) => rule.applies(twoFactor));

/**
 * What needs the user's attention on the Security page, most important
 * first: the status strip lists it, the navigation counts it.
 */
export function securityAttention(
  twoFactor: TwoFactorStatus,
): SecurityAttention[] {
  return applyingRules(twoFactor).map((rule) => rule.id);
}

/**
 * The navigation badge of the Security page: one per item of
 * {@link securityAttention}, in the strongest of their tones.
 */
export function securityAttentionBadge(
  twoFactor: TwoFactorStatus,
): NavBadgeCount {
  return combineNavBadgeCounts(
    applyingRules(twoFactor).map(({ tone }) => ({ count: 1, tone })),
  );
}
