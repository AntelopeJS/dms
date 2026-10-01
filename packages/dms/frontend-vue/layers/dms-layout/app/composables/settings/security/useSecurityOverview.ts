import { useSettingsNavTrails } from "../useSettingsNavTrails";

/** Base URL of the Security page API. */
export const SECURITY_ENDPOINT = "/settings/user/security";
/** Route of the Security page. */
export const SECURITY_PAGE_PATH = "/settings/user/security";
const SECURITY_PAGE_ID = "settings.user.security";
/** At or below this many backup codes left, the page asks for a new set. */
const LOW_BACKUP_CODES = 3;

/** Two-factor state as the API reports it. */
export interface TwoFactorStatus {
  methods: string[];
  hasBackupCodes: boolean;
  backupCodesLeft: number;
  backupCodesTotal: number;
  backupCodesGeneratedAt: string | null;
  backupCodesSavedAt: string | null;
}

/** Summary behind the Security status strip and the profile pointer card. */
export interface SecurityOverview {
  email: string;
  isValidated: boolean;
  hasPassword: boolean;
  passwordChangedAt: string | null;
  accountCreatedAt: string;
  twoFactor: TwoFactorStatus;
  activeSessions: number;
}

/** What the API returns to enrol an authenticator app. */
export interface TotpSetup {
  secret: string;
  /** Base32 key to type into an app that cannot scan. */
  manualKey: string;
  otpAuthUrl: string;
  /** PNG data URL rendered by the backend. */
  qrCode: string;
}

/** Something on the Security page that needs the user's attention. */
export type SecurityAttention =
  | "two_factor_off"
  | "backup_codes_unsaved"
  | "backup_codes_low";

interface AttentionRule {
  id: SecurityAttention;
  applies: (overview: SecurityOverview) => boolean;
}

const isTwoFactorOn = (overview: SecurityOverview): boolean =>
  overview.twoFactor.methods.length > 0;

/**
 * Codes generated before the "saved" stamp existed carry no generation date;
 * they are not flagged, since nothing tells whether they were kept.
 */
const ATTENTION_RULES: AttentionRule[] = [
  { id: "two_factor_off", applies: (overview) => !isTwoFactorOn(overview) },
  {
    id: "backup_codes_unsaved",
    applies: ({ twoFactor }) =>
      twoFactor.hasBackupCodes &&
      !!twoFactor.backupCodesGeneratedAt &&
      !twoFactor.backupCodesSavedAt,
  },
  {
    id: "backup_codes_low",
    applies: (overview) =>
      isTwoFactorOn(overview) &&
      overview.twoFactor.backupCodesLeft <= LOW_BACKUP_CODES,
  },
];

/**
 * @param overview Security summary of the signed-in user
 * @returns The items needing attention, most important first
 */
export function securityAttention(
  overview: SecurityOverview,
): SecurityAttention[] {
  return ATTENTION_RULES.filter((rule) => rule.applies(overview)).map(
    (rule) => rule.id,
  );
}

/**
 * Shared Security summary: the status strip, every Security block and the
 * profile pointer card read the same state, and any change refreshes it for
 * all of them. It also keeps the settings nav dot of the Security page in
 * sync with what needs attention.
 */
export function useSecurityOverview() {
  const overview = useDmsState<SecurityOverview | null>(
    "dms-security-overview",
    () => null,
  );
  const isUnavailable = useDmsState<boolean>(
    "dms-security-overview-unavailable",
    () => false,
  );
  const { $authFetch } = useAuthFetch();
  const { setTrail, clearTrail } = useSettingsNavTrails();
  const { t } = useI18n();

  const attention = computed<SecurityAttention[]>(() =>
    overview.value ? securityAttention(overview.value) : [],
  );

  function syncTrail(): void {
    const [first] = attention.value;
    if (!first) {
      clearTrail(SECURITY_PAGE_ID);
      return;
    }
    setTrail({
      fullId: SECURITY_PAGE_ID,
      status: "warning",
      label: t(`page.settings.security.attention.${first}`),
    });
  }

  async function refresh(): Promise<void> {
    try {
      overview.value = await $authFetch<SecurityOverview>(SECURITY_ENDPOINT);
      isUnavailable.value = false;
    } catch {
      isUnavailable.value = true;
    }
    syncTrail();
  }

  return { overview, attention, isUnavailable, refresh };
}
