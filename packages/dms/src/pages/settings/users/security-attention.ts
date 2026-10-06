import type { TwoFactorStatus } from "./two-factor-operations";

/** Something on the Security page that needs the user's attention. */
export type SecurityAttention =
  | "two_factor_off"
  | "backup_codes_unsaved"
  | "backup_codes_low";

/** Backup codes left at or below which the user is told to make new ones. */
const LOW_BACKUP_CODES = 3;

interface AttentionRule {
  id: SecurityAttention;
  applies: (twoFactor: TwoFactorStatus) => boolean;
}

const isTwoFactorOn = (twoFactor: TwoFactorStatus): boolean =>
  twoFactor.methods.length > 0;

/**
 * Codes generated before the "saved" stamp existed carry no generation date;
 * they are not flagged, since nothing tells whether they were kept.
 */
const ATTENTION_RULES: AttentionRule[] = [
  { id: "two_factor_off", applies: (twoFactor) => !isTwoFactorOn(twoFactor) },
  {
    id: "backup_codes_unsaved",
    applies: (twoFactor) =>
      twoFactor.hasBackupCodes &&
      !!twoFactor.backupCodesGeneratedAt &&
      !twoFactor.backupCodesSavedAt,
  },
  {
    id: "backup_codes_low",
    applies: (twoFactor) =>
      isTwoFactorOn(twoFactor) && twoFactor.backupCodesLeft <= LOW_BACKUP_CODES,
  },
];

/**
 * What needs the user's attention on the Security page, most important
 * first: the status strip lists it, the navigation counts it.
 */
export function securityAttention(
  twoFactor: TwoFactorStatus,
): SecurityAttention[] {
  return ATTENTION_RULES.filter((rule) => rule.applies(twoFactor)).map(
    (rule) => rule.id,
  );
}
