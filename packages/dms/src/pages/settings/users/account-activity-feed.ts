import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import type {
  AccountActivityEvent,
  AccountActivityType,
} from "./account-activity";

/** Settings pages the activity rows and "View all" lead to. */
export const ACTIVITY_PAGE_IDS = {
  security: "settings.user.security",
  profile: "settings.user.profile",
  notifications: "settings.user.notifications",
  members: "settings.workspace.members",
  invites: "settings.workspace.invites",
} as const;

/** Route of each settings page the viewer can open, by page id. */
export type ActivityPageRoutes = Readonly<Record<string, string>>;

const TEXTS = "$page.settings.overview.activity";

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
  tone: Tone;
  pageId: string;
  /** Section of the page the row scrolls to. */
  anchor?: string;
}

const LOOKS: Record<AccountActivityType, EventLook> = {
  session_started: {
    icon: "i-ph-desktop",
    tone: "info",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "sessions",
  },
  sign_in: {
    icon: "i-ph-sign-in",
    tone: "info",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "sessions",
  },
  password_changed: {
    icon: "i-ph-password",
    tone: "neutral",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "password",
  },
  password_reset: {
    icon: "i-ph-key",
    tone: "warning",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "password",
  },
  email_changed: {
    icon: "i-ph-envelope-simple",
    tone: "neutral",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "email",
  },
  two_factor_enabled: {
    icon: "i-ph-shield-check",
    tone: "success",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "two-factor",
  },
  two_factor_disabled: {
    icon: "i-ph-shield-warning",
    tone: "warning",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "two-factor",
  },
  backup_codes_generated: {
    icon: "i-ph-lifebuoy",
    tone: "success",
    pageId: ACTIVITY_PAGE_IDS.security,
    anchor: "two-factor",
  },
  login_method_added: {
    icon: "i-ph-plugs-connected",
    tone: "info",
    pageId: ACTIVITY_PAGE_IDS.security,
  },
  account_created: {
    icon: "i-ph-user-circle-plus",
    tone: "primary",
    pageId: ACTIVITY_PAGE_IDS.profile,
  },
  workspace_joined: {
    icon: "i-ph-buildings",
    tone: "primary",
    pageId: ACTIVITY_PAGE_IDS.members,
  },
  invite_sent: {
    icon: "i-ph-paper-plane-tilt",
    tone: "secondary",
    pageId: ACTIVITY_PAGE_IDS.invites,
  },
  collaborator_joined: {
    icon: "i-ph-user-plus",
    tone: "secondary",
    pageId: ACTIVITY_PAGE_IDS.members,
  },
};

/** An i18n key of the card, with the values it interpolates. */
interface ActivityText {
  key: string;
  params?: Record<string, string>;
}

const text = (key: string, params?: Record<string, string>): ActivityText => ({
  key: `${TEXTS}.${key}`,
  params,
});

/**
 * A text naming a value when the event carries it, a generic one otherwise
 * (`invite_sent` "Invited {email}" or `invite_sent_unnamed`).
 */
const named = (
  key: string,
  param: string,
  value: string | undefined,
): ActivityText =>
  value
    ? text(`event.${key}`, { [param]: value })
    : text(`event.${key}_unnamed`);

const isKnownType = (type: string): type is AccountActivityType =>
  Object.hasOwn(LOOKS, type);

const devicePart = (value: string | undefined): string => {
  const part = (value ?? "").trim();
  return part.toLowerCase() === UNKNOWN_PART ? "" : part;
};

/** "Chrome on Windows" from a session's browser and OS, if either is known. */
function sessionDevice(
  event: AccountActivityEvent,
): Record<string, string> | undefined {
  const browser = devicePart(event.browser?.replace(BROWSER_VERSION, ""));
  const os = devicePart(event.os);
  if (browser && os) return { device: `${TEXTS}.device`, browser, os };
  if (browser || os) return { device: browser || os };
  return undefined;
}

function signedIn(device: Record<string, string> | undefined): ActivityText {
  return device ? text("event.signed_in_on", device) : text("event.signed_in");
}

const TITLES: Partial<
  Record<AccountActivityType, (event: AccountActivityEvent) => ActivityText>
> = {
  session_started: (event) => signedIn(sessionDevice(event)),
  sign_in: (event) =>
    signedIn(event.device ? { device: event.device } : sessionDevice(event)),
  login_method_added: (event) =>
    named("login_method_added", "provider", event.provider),
  workspace_joined: (event) =>
    named("workspace_joined", "workspace", event.workspace),
  invite_sent: (event) => named("invite_sent", "email", event.email),
  collaborator_joined: (event) =>
    named("collaborator_joined", "name", event.actor),
};

type MetaEntry = string | ActivityText | false | undefined;

function workspaceJoinedMeta(event: AccountActivityEvent): MetaEntry {
  if (event.owner) return text("as_owner");
  return !!event.actor && text("invited_by", { name: event.actor });
}

function twoFactorMeta(event: AccountActivityEvent): MetaEntry[] {
  return [
    !!event.method &&
      TWO_FACTOR_METHODS.has(event.method) &&
      text(`method.${event.method}`),
  ];
}

const META: Partial<
  Record<AccountActivityType, (event: AccountActivityEvent) => MetaEntry[]>
> = {
  session_started: (event) => [
    event.location,
    event.ip,
    event.current && text("this_device"),
  ],
  sign_in: (event) => [event.ip],
  email_changed: (event) => [event.email],
  two_factor_enabled: twoFactorMeta,
  two_factor_disabled: twoFactorMeta,
  workspace_joined: (event) => [workspaceJoinedMeta(event)],
  invite_sent: (event) => [event.workspace],
};

function iconOf(event: AccountActivityEvent, look: EventLook): string {
  if (event.type !== "session_started") return look.icon;
  return DEVICE_ICONS[event.deviceType ?? ""] ?? look.icon;
}

function toneOf(event: AccountActivityEvent, look: EventLook): Tone {
  return event.type === "session_started" && event.current
    ? "primary"
    : look.tone;
}

/** The title and details of an event, with every value they interpolate. */
function textsOf(event: AccountActivityType, source: AccountActivityEvent) {
  const title = TITLES[event]?.(source) ?? text(`event.${event}`);
  const entries = (META[event]?.(source) ?? []).filter(
    (entry): entry is string | ActivityText => !!entry,
  );
  const params: Record<string, string> = { ...title.params };
  const meta = entries.map((entry) => {
    if (typeof entry === "string") return entry;
    Object.assign(params, entry.params);
    return entry.key;
  });
  return { title: title.key, meta, params };
}

/**
 * The rows of the settings overview's activity feed, in the order the events
 * come (newest first). Unknown event types are skipped; a row links to its
 * page only when the viewer can open it.
 *
 * @param events Events of the viewer's own account
 * @param routes Route of each settings page the viewer can open, by page id
 */
export function toActivityFeedItems(
  events: readonly AccountActivityEvent[],
  routes: ActivityPageRoutes,
): ActivityFeedItem[] {
  return events.flatMap((event) => {
    if (!isKnownType(event.type)) return [];
    const look = LOOKS[event.type];
    const route = routes[look.pageId];
    const { title, meta, params } = textsOf(event.type, event);
    const item: ActivityFeedItem = {
      id: event.id,
      icon: iconOf(event, look),
      tone: toneOf(event, look),
      title,
      date: new Date(event.date).toISOString(),
    };
    if (meta.length) item.meta = meta;
    if (Object.keys(params).length) item.params = params;
    if (route) item.to = look.anchor ? `${route}#${look.anchor}` : route;
    return [item];
  });
}
