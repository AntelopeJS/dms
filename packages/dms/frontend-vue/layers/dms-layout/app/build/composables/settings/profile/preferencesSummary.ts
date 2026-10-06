// The sentences of the profile's "Preferences & access" rows, and which rows
// the user may see. Pure: useProfilePreferences reads the data.

import type { TimeFormatPreference } from "#dms-core/app/utils/regional";
import type { AccessibilityPreferences } from "#dms-ui/app/build/utils/accessibilityPreferences";
import type { NotificationSubject } from "../../notification/useNotificationCatalog";
import type {
  ColorModePreference,
  InterfaceScale,
} from "../../../../composables/general/types";

/** `t` as vue-i18n takes it: key, named params, plural count. */
export type SummaryTranslate = (
  key: string,
  params?: Record<string, unknown>,
  plural?: number,
) => string;

const KEY = "page.settings.profile.preferences";
const SEPARATOR = " · ";
// 4 January 2026 is a Sunday: day `n` of the week is `n` days later.
const FIRST_SUNDAY_UTC = Date.UTC(2026, 0, 4, 12);
const DAY_MS = 24 * 60 * 60 * 1000;

/** The settings page each row opens, which is also the page that gates it. */
export const PREFERENCE_ROW_PAGES = {
  access: "settings.workspace.roles",
  region: "settings.user.region",
  notifications: "settings.user.notifications",
  appearance: "settings.user.appearance",
} as const;

export type PreferenceRowId = keyof typeof PREFERENCE_ROW_PAGES;

export interface PreferenceRow {
  visible: boolean;
  /** Route of the row's button; none when the user cannot open the page. */
  to?: string;
}

/**
 * Which rows show and where their buttons lead, from the settings pages the
 * user can open (the ones the settings navigation lists, by full id). A
 * personal page the user cannot open takes its row away; "Your access"
 * always shows, and only links to the roles page when it opens.
 */
export function resolvePreferenceRows(
  openPages: ReadonlyMap<string, string>,
): Record<PreferenceRowId, PreferenceRow> {
  const row = (id: PreferenceRowId, alwaysVisible = false): PreferenceRow => {
    const to = openPages.get(PREFERENCE_ROW_PAGES[id]);
    return { visible: alwaysVisible || to !== undefined, to };
  };
  return {
    access: row("access", true),
    region: row("region"),
    notifications: row("notifications"),
    appearance: row("appearance"),
  };
}

/** What `GET /settings/user/profile/access` answers. */
export interface ProfileAccess {
  roles: string[];
  workspaceOwner: boolean;
  platformOwner: boolean;
}

/**
 * `Roles: Admin, Finance · workspace owner`. An owner without a role is
 * said as such rather than as "No role".
 */
export function buildAccessSummary(
  t: SummaryTranslate,
  access: ProfileAccess,
): string {
  const { roles } = access;
  const owner = access.platformOwner
    ? "platform_owner"
    : access.workspaceOwner
      ? "workspace_owner"
      : undefined;
  if (!roles.length) {
    return t(`${KEY}.${owner ? `access_${owner}_alone` : "access_no_role"}`);
  }
  const held = t(
    `${KEY}.access_roles`,
    { roles: roles.join(", ") },
    roles.length,
  );
  return owner ? [held, t(`${KEY}.access_${owner}`)].join(SEPARATOR) : held;
}

/** The regional settings as they apply, "Automatic" already resolved. */
export interface RegionFacts {
  language: string;
  /** Display label of the time zone. */
  timeZone: string;
  /** Today, as the dashboard writes a full date. */
  date: string;
  timeFormat: TimeFormatPreference;
  /** 0 Sunday … 6 Saturday. */
  weekStart: number;
  locale: string;
}

/** The weekday `day` (0 Sunday … 6 Saturday) as `locale` names it. */
export function weekdayName(locale: string, day: number): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(FIRST_SUNDAY_UTC + day * DAY_MS));
}

/**
 * `Français · Europe / Brussels: dates 03/10/2026, 24-hour time, weeks start
 * on Monday`.
 */
export function buildRegionSummary(
  t: SummaryTranslate,
  facts: RegionFacts,
): string {
  return t(`${KEY}.region_summary`, {
    language: facts.language,
    zone: facts.timeZone,
    date: facts.date,
    clock: t(`${KEY}.clock_${facts.timeFormat}`),
    weekday: weekdayName(facts.locale, facts.weekStart),
  });
}

export interface SubjectTally {
  on: number;
  total: number;
}

/** Subjects that reach the user: switched on, or locked on by the server. */
export function tallySubjects(
  subjects: readonly NotificationSubject[],
  isEnabled: (subject: NotificationSubject) => boolean,
): SubjectTally {
  return {
    on: subjects.filter((subject) => subject.locked || isEnabled(subject))
      .length,
    total: subjects.length,
  };
}

/**
 * `3 unread notifications · 6 of 9 subjects on · email coming soon`. Without
 * a tally (the preferences did not load) the subjects are left out.
 */
export function buildNotificationsSummary(
  t: SummaryTranslate,
  unread: number,
  subjects?: SubjectTally,
): string {
  const parts = [t(`${KEY}.notifications_unread`, { count: unread }, unread)];
  if (subjects && subjects.total > 0) {
    parts.push(t(`${KEY}.notifications_subjects`, { ...subjects }));
  }
  parts.push(t(`${KEY}.notifications_email_soon`));
  return parts.join(SEPARATOR);
}

export interface AppearanceFacts {
  theme: ColorModePreference;
  /** What a `system` theme resolves to right now. */
  systemDark: boolean;
  scale: InterfaceScale;
  accessibility: AccessibilityPreferences;
  locale: string;
}

/** The accessibility options that are on, in the Appearance page's order. */
function activeAccessibilityOptions(
  preferences: AccessibilityPreferences,
): string[] {
  return [
    preferences.reduceMotion === "on" && "reduce_motion",
    preferences.increaseContrast && "increase_contrast",
    preferences.underlineLinks && "underline_links",
  ].filter((option): option is string => !!option);
}

/**
 * `Dark theme · normal density · increased contrast on`. Accessibility is
 * only mentioned when an option is on.
 */
export function buildAppearanceSummary(
  t: SummaryTranslate,
  facts: AppearanceFacts,
): string {
  const theme =
    facts.theme === "system"
      ? t(`${KEY}.theme_system_${facts.systemDark ? "dark" : "light"}`)
      : t(`${KEY}.theme_${facts.theme}`);
  const parts = [theme, t(`${KEY}.density_${facts.scale}`)];
  const options = activeAccessibilityOptions(facts.accessibility).map(
    (option) => t(`${KEY}.a11y_${option}`),
  );
  if (options.length) {
    const list = new Intl.ListFormat(facts.locale, {
      type: "conjunction",
    }).format(options);
    parts.push(t(`${KEY}.accessibility_on`, { options: list }));
  }
  return parts.join(SEPARATOR);
}
