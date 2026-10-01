import type { DmsTone } from "#dms-ui/app/utils/tone";

/** Events the backend lists (`GET /settings/user/profile/activity`). */
export type AccountActivityType =
  | "session_started"
  | "sign_in"
  | "password_changed"
  | "password_reset"
  | "email_changed"
  | "two_factor_enabled"
  | "two_factor_disabled"
  | "backup_codes_generated"
  | "login_method_added"
  | "account_created"
  | "workspace_joined"
  | "invite_sent"
  | "collaborator_joined";

/** One event of the viewer's own account, as the backend answers it. */
export interface AccountActivityEvent {
  id: string;
  type: AccountActivityType | string;
  /** ISO date. */
  date: string;
  browser?: string;
  os?: string;
  deviceType?: string;
  /** Sign-in alert: "Chrome on Windows". */
  device?: string;
  ip?: string;
  location?: string;
  current?: boolean;
  method?: string;
  provider?: string;
  email?: string;
  workspace?: string;
  actor?: string;
  owner?: boolean;
}

/** A literal, or an i18n key whose params may be texts themselves. */
export type ActivityText =
  | { literal: string }
  | { key: string; params?: Record<string, string | ActivityText> };

type Translate = (key: string, params?: Record<string, string>) => string;

/** One row of the card, before translation. */
export interface AccountActivityRow {
  id: string;
  type: string;
  icon: string;
  tone: DmsTone;
  title: ActivityText;
  /** Dimmed details, joined by "·". */
  meta: ActivityText[];
  date: string;
  /** Page the row leads to, when the viewer can open it. */
  to?: string;
  /** Id of that page, which the role preview veils the row by. */
  pageId?: string;
}

/** Pages the rows and the "View all" link lead to. */
export const ACTIVITY_SECURITY_PAGE_ID = "settings.user.security";
export const ACTIVITY_PROFILE_PAGE_ID = "settings.user.profile";
export const ACTIVITY_NOTIFICATIONS_PAGE_ID = "settings.user.notifications";
export const ACTIVITY_MEMBERS_PAGE_ID = "settings.user.members";
export const ACTIVITY_INVITES_PAGE_ID = "settings.user.members.invites";

const KEY = "page.settings.overview.activity";
// "Chrome 150.0.7871.250" reads as "Chrome": the version is noise here.
const BROWSER_VERSION = /\s+[\d.]+$/;
// What the sign-in records when the user agent names no browser or OS.
const UNKNOWN_PART = "unknown";
const DEVICE_ICONS: Record<string, string> = {
  desktop: "i-ph-desktop",
  mobile: "i-ph-device-mobile",
  tablet: "i-ph-device-tablet",
};
const TWO_FACTOR_METHODS = new Set(["totp", "email"]);

interface EventLook {
  icon: string;
  tone: DmsTone;
  pageId: string;
  /** Section of the page the row scrolls to. */
  anchor?: string;
}

const LOOKS: Record<AccountActivityType, EventLook> = {
  session_started: {
    icon: DEVICE_ICONS.desktop!,
    tone: "info",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "sessions",
  },
  sign_in: {
    icon: "i-ph-sign-in",
    tone: "info",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "sessions",
  },
  password_changed: {
    icon: "i-ph-password",
    tone: "neutral",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "password",
  },
  password_reset: {
    icon: "i-ph-key",
    tone: "warning",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "password",
  },
  email_changed: {
    icon: "i-ph-envelope-simple",
    tone: "neutral",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "email",
  },
  two_factor_enabled: {
    icon: "i-ph-shield-check",
    tone: "success",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "two-factor",
  },
  two_factor_disabled: {
    icon: "i-ph-shield-warning",
    tone: "warning",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "two-factor",
  },
  backup_codes_generated: {
    icon: "i-ph-lifebuoy",
    tone: "success",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
    anchor: "two-factor",
  },
  login_method_added: {
    icon: "i-ph-plugs-connected",
    tone: "info",
    pageId: ACTIVITY_SECURITY_PAGE_ID,
  },
  account_created: {
    icon: "i-ph-user-circle-plus",
    tone: "accent",
    pageId: ACTIVITY_PROFILE_PAGE_ID,
  },
  workspace_joined: {
    icon: "i-ph-buildings",
    tone: "accent",
    pageId: ACTIVITY_MEMBERS_PAGE_ID,
  },
  invite_sent: {
    icon: "i-ph-paper-plane-tilt",
    tone: "secondary",
    pageId: ACTIVITY_INVITES_PAGE_ID,
  },
  collaborator_joined: {
    icon: "i-ph-user-plus",
    tone: "secondary",
    pageId: ACTIVITY_MEMBERS_PAGE_ID,
  },
};

const isKnownType = (type: string): type is AccountActivityType =>
  Object.hasOwn(LOOKS, type);

const text = (
  key: string,
  params?: Record<string, string | ActivityText>,
): ActivityText =>
  params ? { key: `${KEY}.${key}`, params } : { key: `${KEY}.${key}` };

const literal = (value: string | undefined): ActivityText | undefined =>
  value ? { literal: value } : undefined;

const present = (
  entries: Array<ActivityText | false | undefined>,
): ActivityText[] => entries.filter((entry): entry is ActivityText => !!entry);

const devicePart = (value: string | undefined): string => {
  const part = (value ?? "").trim();
  return part.toLowerCase() === UNKNOWN_PART ? "" : part;
};

/** "Chrome on Windows" from a session's browser and OS, if either is known. */
function sessionDevice(event: AccountActivityEvent): ActivityText | undefined {
  const browser = devicePart(event.browser?.replace(BROWSER_VERSION, ""));
  const os = devicePart(event.os);
  if (!browser && !os) return undefined;
  if (browser && os) return text("device", { browser, os });
  return text("device_single", { device: browser || os });
}

function titleOf(event: AccountActivityEvent): ActivityText {
  switch (event.type) {
    case "session_started": {
      const device = sessionDevice(event);
      return device
        ? text("event.signed_in_on", { device })
        : text("event.signed_in");
    }
    case "sign_in":
      return event.device
        ? text("event.signed_in_on", { device: event.device })
        : text("event.signed_in");
    case "login_method_added":
      return event.provider
        ? text("event.login_method_added", { provider: event.provider })
        : text("event.login_method_added_unnamed");
    case "workspace_joined":
      return event.workspace
        ? text("event.workspace_joined", { workspace: event.workspace })
        : text("event.workspace_joined_unnamed");
    case "invite_sent":
      return event.email
        ? text("event.invite_sent", { email: event.email })
        : text("event.invite_sent_unnamed");
    case "collaborator_joined":
      return event.actor
        ? text("event.collaborator_joined", { name: event.actor })
        : text("event.collaborator_joined_unnamed");
    default:
      return text(`event.${event.type}`);
  }
}

function metaOf(event: AccountActivityEvent): ActivityText[] {
  switch (event.type) {
    case "session_started":
      return present([
        literal(event.location),
        literal(event.ip),
        event.current && text("this_device"),
      ]);
    case "sign_in":
      return present([literal(event.ip)]);
    case "email_changed":
      return present([literal(event.email)]);
    case "two_factor_enabled":
    case "two_factor_disabled":
      return present([
        !!event.method &&
          TWO_FACTOR_METHODS.has(event.method) &&
          text(`method.${event.method}`),
      ]);
    case "workspace_joined":
      return present([
        event.owner
          ? text("as_owner")
          : !!event.actor && text("invited_by", { name: event.actor }),
      ]);
    case "invite_sent":
      return present([literal(event.workspace)]);
    default:
      return [];
  }
}

/** Translates a text, its nested texts first. */
export function translateActivityText(
  value: ActivityText,
  t: Translate,
): string {
  if ("literal" in value) return value.literal;
  if (!value.params) return t(value.key);
  const params = Object.fromEntries(
    Object.entries(value.params).map(([name, param]) => [
      name,
      typeof param === "string" ? param : translateActivityText(param, t),
    ]),
  );
  return t(value.key, params);
}

/**
 * The card's rows, in the order the backend sent them (newest first).
 * Unknown event types are skipped. A row links to its page only when the
 * viewer can open it.
 *
 * @param events Events of the viewer's own account
 * @param pages Route of each settings page the viewer can open, by page id
 */
export function buildAccountActivityRows(
  events: readonly AccountActivityEvent[],
  pages: Readonly<Record<string, string>>,
): AccountActivityRow[] {
  const rows: AccountActivityRow[] = [];
  for (const event of events) {
    if (!isKnownType(event.type)) continue;
    const look = LOOKS[event.type];
    const route = pages[look.pageId];
    const icon =
      event.type === "session_started"
        ? (DEVICE_ICONS[event.deviceType ?? ""] ?? look.icon)
        : look.icon;
    rows.push({
      id: event.id,
      type: event.type,
      icon,
      tone:
        event.type === "session_started" && event.current
          ? "accent"
          : look.tone,
      title: titleOf(event),
      meta: metaOf(event),
      date: event.date,
      ...(route
        ? {
            to: look.anchor ? `${route}#${look.anchor}` : route,
            pageId: look.pageId,
          }
        : {}),
    });
  }
  return rows;
}

/**
 * Where "View all" leads: the notifications inbox, else the Security page,
 * whichever the viewer can open first.
 */
export function activityViewAllPage(
  pages: Readonly<Record<string, string>>,
): { to: string; pageId: string } | undefined {
  for (const pageId of [
    ACTIVITY_NOTIFICATIONS_PAGE_ID,
    ACTIVITY_SECURITY_PAGE_ID,
  ]) {
    const to = pages[pageId];
    if (to) return { to, pageId };
  }
  return undefined;
}
