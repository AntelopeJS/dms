import { usePreferredDark } from "@vueuse/core";
import { computed, onMounted, ref } from "vue";
import { useUserRegionalPreferences } from "#dms-core/app/composables/user/useUserRegionalPreferences";
import { useUniqueLocales } from "#dms-core/app/composables/translation/useUniqueLocales";
import { formatDate } from "#dms-core/app/utils/formatter";
import { useAccessibilityPreferences } from "../../general/useAccessibilityPreferences";
import { useColorModePreference } from "../../general/useColorModePreference";
import { useInterfaceScale } from "../../general/useInterfaceScale";
import { useIsOwner } from "../../page/useIsOwner";
import { useNotificationCatalog } from "../../notification/useNotificationCatalog";
import { useNotificationPreferences } from "../../notification/useNotificationPreferences";
import { useNotifications } from "../../notification/useNotifications";
import { timeZoneLabel } from "../region/timeZones";
import { useSettingsNavigation } from "../useSettingsNavigation";
import { useSettingsNavTrails } from "../useSettingsNavTrails";
import {
  buildAccessSummary,
  buildAppearanceSummary,
  buildNotificationsSummary,
  buildRegionSummary,
  PREFERENCE_ROW_PAGES,
  type ProfileAccess,
  resolvePreferenceRows,
  type SummaryTranslate,
  tallySubjects,
} from "./preferencesSummary";

export const PROFILE_ACCESS_ENDPOINT = "/settings/user/profile/access";
// Sample values the skeletons are shaped from.
const SAMPLE_ACCESS: ProfileAccess = {
  roles: ["Admin", "Finance"],
  workspaceOwner: false,
  platformOwner: false,
};
// Who holds every permission is most likely a platform owner.
const SAMPLE_OWNER_ACCESS: ProfileAccess = {
  roles: [],
  workspaceOwner: false,
  platformOwner: true,
};
const SAMPLE_TIME_ZONE = "Europe/Brussels";
// Noon UTC: the same calendar day in every time zone a server or browser
// could run in, so both write the same sample date.
const SAMPLE_DATE = new Date(Date.UTC(2026, 9, 3, 12));
const SAMPLE_UNREAD = 3;
const SAMPLE_TALLY = { on: 6, total: 9 };
const MONDAY = 1;

/**
 * The profile's "Preferences & access" rows: which ones the user may see,
 * and each one's sentence, `undefined` while it is not known yet (the row
 * shows a skeleton then, never a made-up "0 unread").
 *
 * Nothing is awaited before render. The roles and the notification
 * preferences are fetched after mount; the unread count is the header bell's
 * own; the regional and appearance sentences, which depend on the browser
 * (time zone, today's date, the system theme), are written after mount so
 * the server and the hydrating browser render the same skeleton.
 */
export function useProfilePreferences() {
  const { t: translate, locale } = useI18n();
  const t = translate as SummaryTranslate;
  const { $authFetch } = useAuthFetch();
  const { groups } = useSettingsNavigation();
  const isOwner = useIsOwner();
  const isMounted = ref(false);

  // The settings navigation's own list decides: a row shows when the page
  // it leads to is one the nav offers.
  const rows = computed(() =>
    resolvePreferenceRows(
      new Map(
        groups.value.flatMap((group) =>
          group.pages.map((page) => [page.fullId, page.to] as const),
        ),
      ),
    ),
  );

  const access = ref<ProfileAccess>();
  const accessFailed = ref(false);
  const accessSummary = computed(() => {
    if (access.value) return buildAccessSummary(t, access.value);
    return accessFailed.value
      ? t("page.settings.profile.preferences.access_unavailable")
      : undefined;
  });

  async function loadAccess(): Promise<void> {
    try {
      access.value = await $authFetch<ProfileAccess>(PROFILE_ACCESS_ENDPOINT);
    } catch {
      accessFailed.value = true;
    }
  }

  const { uniqueLocales } = useUniqueLocales();
  const regional = useUserRegionalPreferences();
  // Frozen at mount: the row shows formats, not a ticking clock.
  let today = new Date();
  // Some languages name themselves in lower case ("français"): it opens
  // the summary, so it is capitalized.
  const languageName = computed(() => {
    const tag = locale.value;
    const name =
      uniqueLocales.value.find((entry) => entry.code === tag)?.name ?? tag;
    return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
  });
  const regionSummary = computed(() => {
    if (!isMounted.value) return undefined;
    return buildRegionSummary(t, {
      language: languageName.value,
      timeZone: timeZoneLabel(regional.timeZone.value),
      date: formatDate(today, locale.value) ?? "",
      timeFormat: regional.timeFormat.value,
      weekStart: regional.weekStartsOn.value,
      locale: locale.value,
    });
  });

  const notificationPreferences = useNotificationPreferences();
  const { subjects } = useNotificationCatalog();
  const { unreadCount } = useNotifications();
  const { isIndicatorPending } = useSettingsNavTrails();
  const isNotificationsLoading = computed(
    () =>
      notificationPreferences.isLoading.value ||
      isIndicatorPending(PREFERENCE_ROW_PAGES.notifications),
  );
  const notificationsSummary = computed(() => {
    if (isNotificationsLoading.value) return undefined;
    const tally = notificationPreferences.loadFailed.value
      ? undefined
      : tallySubjects(subjects.value, notificationPreferences.isEnabled);
    return buildNotificationsSummary(t, unreadCount.value, tally);
  });
  const hasUnread = computed(
    () => !isNotificationsLoading.value && unreadCount.value > 0,
  );

  const colorMode = useColorModePreference();
  const scale = useInterfaceScale();
  const { preferences: accessibility } = useAccessibilityPreferences();
  const prefersDark = usePreferredDark();
  // The cookies are read on the server too; only a theme that follows the
  // system waits for the browser to say which it is.
  const appearanceSummary = computed(() => {
    if (colorMode.value === "system" && !isMounted.value) return undefined;
    return buildAppearanceSummary(t, {
      theme: colorMode.value,
      systemDark: prefersDark.value,
      scale: scale.value,
      accessibility: accessibility.value,
      locale: locale.value,
    });
  });

  // What the skeletons are drawn from: the same sentences with what the
  // server already knows, and sample values for the rest. Nothing here
  // reads the browser, so the server and the hydrating browser agree.
  const placeholders = computed(() => {
    const { preferences } = regional;
    return {
      access: buildAccessSummary(
        t,
        isOwner.value ? SAMPLE_OWNER_ACCESS : SAMPLE_ACCESS,
      ),
      region: buildRegionSummary(t, {
        language: languageName.value,
        timeZone: timeZoneLabel(preferences.value.timeZone ?? SAMPLE_TIME_ZONE),
        date: formatDate(SAMPLE_DATE, locale.value) ?? "",
        timeFormat: preferences.value.timeFormat ?? "h23",
        weekStart: preferences.value.weekStart ?? MONDAY,
        locale: locale.value,
      }),
      notifications: buildNotificationsSummary(t, SAMPLE_UNREAD, SAMPLE_TALLY),
      appearance: buildAppearanceSummary(t, {
        theme: colorMode.value,
        systemDark: false,
        scale: scale.value,
        accessibility: accessibility.value,
        locale: locale.value,
      }),
    };
  });

  onMounted(() => {
    today = new Date();
    isMounted.value = true;
    void loadAccess();
    if (rows.value.notifications.visible) void notificationPreferences.load();
  });

  return {
    rows,
    accessSummary,
    regionSummary,
    notificationsSummary,
    hasUnread,
    appearanceSummary,
    placeholders,
  };
}
