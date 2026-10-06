import { useNavBadges } from "#dms-ui/app/composables/navigation/useNavBadges";

/** Base URL of the Security page API. */
export const SECURITY_ENDPOINT = "/settings/user/security";
/** Route of the Security page. */
export const SECURITY_PAGE_PATH = "/settings/user/security";
const SECURITY_PAGE_ID = "settings.user.security";

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
  /** The address a sign-in email change waits on, until its code is entered. */
  pendingEmail: string | null;
  isValidated: boolean;
  hasPassword: boolean;
  passwordChangedAt: string | null;
  accountCreatedAt: string;
  twoFactor: TwoFactorStatus;
  activeSessions: number;
  /** What needs the user's attention, most important first. */
  attention: SecurityAttention[];
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

/**
 * Shared Security summary: the status strip, every Security block and the
 * profile pointer card read the same state, and any change refreshes it for
 * all of them. It also keeps the navigation badge of the Security page, the
 * count of what needs attention, in sync after a change.
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
  const { setNavBadge } = useNavBadges();

  const attention = computed<SecurityAttention[]>(
    () => overview.value?.attention ?? [],
  );

  async function refresh(): Promise<void> {
    try {
      overview.value = await $authFetch<SecurityOverview>(SECURITY_ENDPOINT);
      isUnavailable.value = false;
    } catch {
      isUnavailable.value = true;
      return;
    }
    const count = attention.value.length;
    setNavBadge(SECURITY_PAGE_ID, count > 0 ? String(count) : "");
  }

  return { overview, attention, isUnavailable, refresh };
}
