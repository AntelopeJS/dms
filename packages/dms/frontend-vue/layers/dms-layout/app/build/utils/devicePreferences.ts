import { PREFERENCES_COOKIE_NAME } from "#dms-core/app/entries/composables/user/preferencesCookie";
import { LOCAL_TABLE_KEY_PREFIX } from "#dms-core/app/entries/composables/user/tablePreferences";
import { DRAWER_SIZE_COOKIE } from "#dms-ui/app/entries/composables/containers/drawerSize";
import { LIVE_PAUSE_KEY_PREFIX } from "#dms-ui/app/entries/composables/live/liveStorage";
import { ACCESSIBILITY_COOKIE } from "#dms-ui/app/entries/utils/accessibilityPreferences";
import { BANNER_DISMISSED_COOKIE } from "#dms-ui/app/entries/utils/bannerDismissals";
import {
  COLOR_MODE_COOKIE,
  COLOR_SCHEME_STORAGE_KEY,
} from "../../composables/general/useColorModePreference";
import { INTERFACE_SCALE_COOKIE } from "../../composables/general/useInterfaceScale";
import { DISMISSED_BANNERS_COOKIE } from "../../composables/layout/useLayoutBanners";
import { MODULE_HISTORY_COOKIE } from "../../composables/page/useModuleHistory";
import { GITHUB_STAR_PROMPT_KEY_PREFIX } from "../composables/general/useGithubStarPrompt";
import { SIDEBAR_START_COLLAPSED_COOKIE } from "../composables/general/useSidebarStartCollapsed";
import { SIDE_PANEL_COOKIE } from "#dms-ui/app/entries/composables/layout/sidePanelState";
import { NOTIFICATION_GROUP_STORAGE_PREFIX } from "../composables/notification/useNotificationGroupsOpen";
import { DASHBOARD_STORAGE_KEY } from "./dashboardStorage";

/**
 * What the user chose on this device and the DMS remembers there, cleared by
 * "Reset this device's preferences": the tables' state (sort, filters,
 * columns, views), the remembered periods, the drawers' sizes, the sidebar's
 * width and folded state, the side panel, the appearance, the dismissed
 * banners and tips, the recent modules, the paused live pages and the folded
 * notification groups.
 *
 * Left alone: the session and the signed-in accounts, the favorite pages (a
 * list the user built, not a display choice), the language and the time zone
 * (the account's regional settings and the browser's zone, written back at
 * once), the keyboard platform (detected, not chosen: the next server render
 * would draw the wrong key hints) and a permission preview in progress.
 */
export const DEVICE_PREFERENCE_COOKIES: readonly string[] = [
  PREFERENCES_COOKIE_NAME,
  DRAWER_SIZE_COOKIE,
  SIDE_PANEL_COOKIE,
  SIDEBAR_START_COLLAPSED_COOKIE,
  COLOR_MODE_COOKIE,
  INTERFACE_SCALE_COOKIE,
  ACCESSIBILITY_COOKIE,
  DISMISSED_BANNERS_COOKIE,
  BANNER_DISMISSED_COOKIE,
  MODULE_HISTORY_COOKIE,
];

/** The cookies of those preferences whose name ends with a generated id. */
export const DEVICE_PREFERENCE_COOKIE_PREFIXES: readonly string[] = [
  `${DASHBOARD_STORAGE_KEY}-`,
];

/** The `localStorage` keys of those preferences, by prefix or whole. */
export const DEVICE_PREFERENCE_STORAGE_PREFIXES: readonly string[] = [
  LOCAL_TABLE_KEY_PREFIX,
  LIVE_PAUSE_KEY_PREFIX,
  NOTIFICATION_GROUP_STORAGE_PREFIX,
  GITHUB_STAR_PROMPT_KEY_PREFIX,
  COLOR_SCHEME_STORAGE_KEY,
];

function expireCookie(name: string): void {
  const secure = window.isSecureContext ? "; secure" : "";
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax${secure}`;
}

function preferenceCookieNames(): string[] {
  const present = document.cookie
    .split(";")
    .map((entry) => entry.split("=")[0]?.trim() ?? "")
    .filter((name) =>
      DEVICE_PREFERENCE_COOKIE_PREFIXES.some((prefix) =>
        name.startsWith(prefix),
      ),
    );
  return [...DEVICE_PREFERENCE_COOKIES, ...present];
}

function clearStorage(): void {
  let storage: Storage;
  try {
    storage = window.localStorage;
  } catch {
    return;
  }
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  );
  for (const key of keys) {
    if (
      key &&
      DEVICE_PREFERENCE_STORAGE_PREFIXES.some((prefix) =>
        key.startsWith(prefix),
      )
    )
      storage.removeItem(key);
  }
}

/**
 * Forgets every preference of {@link DEVICE_PREFERENCE_COOKIES},
 * {@link DEVICE_PREFERENCE_COOKIE_PREFIXES} and
 * {@link DEVICE_PREFERENCE_STORAGE_PREFIXES} on this device. The page in
 * memory still holds them: reload it for the defaults to show.
 */
export function resetDevicePreferences(): void {
  if (typeof window === "undefined") return;
  for (const name of preferenceCookieNames()) expireCookie(name);
  clearStorage();
}
