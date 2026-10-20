export interface AccountMenuEntry {
  labelKey: string;
  icon: string;
  to: string;
}

export const PROFILE_ROUTE = "/settings/user/profile";
export const SETTINGS_ROUTE = "/settings";
// The Account category has no landing page of its own, and Profile has its
// own entry: the user's settings open on the next Account page instead. The
// sidebar footer keeps the way to every setting (`SETTINGS_ROUTE`).
export const ACCOUNT_SETTINGS_ROUTE = "/settings/user/region";
export const SWITCH_ACCOUNT_ROUTE = "/auth/accounts";

/**
 * Canonical account navigation entries, rendered by both the sidebar user
 * menu and the command palette's session source so the two surfaces cannot
 * drift.
 */
export const ACCOUNT_MENU_ENTRIES: AccountMenuEntry[] = [
  { labelKey: "menu.profile", icon: "i-ph-user-light", to: PROFILE_ROUTE },
  {
    labelKey: "menu.account_settings",
    icon: "i-ph-gear-light",
    to: ACCOUNT_SETTINGS_ROUTE,
  },
  {
    labelKey: "menu.switch_account",
    icon: "i-ph-users-light",
    to: SWITCH_ACCOUNT_ROUTE,
  },
];
