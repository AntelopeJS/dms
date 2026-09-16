export interface AccountMenuEntry {
  labelKey: string;
  icon: string;
  to: string;
}

export const PROFILE_ROUTE = "/settings/user/profile";
export const SETTINGS_ROUTE = "/settings";
export const SWITCH_ACCOUNT_ROUTE = "/auth/accounts";

/**
 * Canonical account navigation entries, rendered by both the header user
 * menu and the command palette's session source so the two surfaces cannot
 * drift.
 */
export const ACCOUNT_MENU_ENTRIES: AccountMenuEntry[] = [
  { labelKey: "menu.profile", icon: "i-ph-user-light", to: PROFILE_ROUTE },
  {
    labelKey: "menu.section.settings",
    icon: "i-ph-gear-light",
    to: SETTINGS_ROUTE,
  },
  {
    labelKey: "menu.switch_account",
    icon: "i-ph-users-light",
    to: SWITCH_ACCOUNT_ROUTE,
  },
];
