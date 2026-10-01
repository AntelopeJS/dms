// The "Recent account activity" card of the settings overview: the latest
// events of the signed-in user's own account, merged from the rows the DMS
// already keeps. Pure: the store (account-activity-store.ts) reads the rows.

import type { Session, User } from "@antelopejs/interface-dms/auth/db";
import type { TenantMember, UserInvite } from "@antelopejs/interface-dms/db";
import type { UserNotification } from "../../../db";

/** Entries the card shows at most. */
export const ACCOUNT_ACTIVITY_LIMIT = 6;

/**
 * Two records of one event (the session a sign-in opened and its security
 * alert, the password change and its notification) land within this window.
 */
export const ACTIVITY_DEDUPE_WINDOW_MS = 2 * 60 * 1000;

/** Notification subjects about the account itself. */
const ACCOUNT_SUBJECTS = new Set(["security", "account", "collaboration"]);
const MESSAGE_ID = /^\$?dms\.notifications\.messages\.([a-z0-9_]+)\.title$/;
const TWO_FACTOR_MESSAGE = /^two_factor_(enabled|disabled)_(totp|email)$/;
// "Chrome on Windows (203.0.113.7)": the origin param wraps the IP.
const ORIGIN_IP = /^\s*\(([^)]*)\)\s*$/;

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

export type TwoFactorMethod = "totp" | "email";

/**
 * One event of the account. Only display fields: never a token, hash,
 * secret, user agent or another user's email.
 */
export interface AccountActivityEvent {
  id: string;
  type: AccountActivityType;
  date: Date;
  /** Session: browser and OS as the sign-in recorded them. */
  browser?: string;
  os?: string;
  deviceType?: string;
  /** Sign-in alert: "Chrome on Windows", as the alert phrased it. */
  device?: string;
  ip?: string;
  location?: string;
  /** The session the request comes from ("This device"). */
  current?: boolean;
  method?: TwoFactorMethod;
  /** Single sign-on provider linked to the account. */
  provider?: string;
  /** The new sign-in email, or the address the user invited. */
  email?: string;
  /** Workspace joined, or invited to. */
  workspace?: string;
  /** Who did it: the inviter, or the collaborator who joined. */
  actor?: string;
  /** Joined the workspace as one of its owners. */
  owner?: boolean;
}

/** A membership of the user, with the names the card shows. */
export interface ActivityMembershipSource {
  member: TenantMember;
  workspace: string;
  /** Name of the member who invited the user, when known. */
  invitedByName?: string;
}

/** An invitation the user sent, with the workspace it invites to. */
export interface ActivityInviteSource {
  invite: UserInvite;
  workspace: string;
}

/** Every row the activity is built from; a failed source is left empty. */
export interface AccountActivitySources {
  user: User;
  sessions: Session[];
  /** The user's latest notifications, any subject. */
  notifications: UserNotification[];
  memberships: ActivityMembershipSource[];
  invites: ActivityInviteSource[];
  /** Id of the session the request comes from. */
  currentSessionId?: string;
}

type Draft = Omit<AccountActivityEvent, "id">;

const toTime = (value: Date | string | null | undefined): number => {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
};

const textParam = (
  params: UserNotification["params"],
  key: string,
): string | undefined => {
  const value = params?.[key];
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
};

function messageIdOf(notification: UserNotification): string | undefined {
  return MESSAGE_ID.exec(notification.title ?? "")?.[1];
}

/**
 * Maps one of the account notifications the DMS sends onto its event. Other
 * notifications, a module's own or a subject outside the account, give none.
 */
export function notificationToEvent(
  notification: UserNotification,
): Draft | undefined {
  if (!ACCOUNT_SUBJECTS.has(notification.subjectId)) return undefined;
  const messageId = messageIdOf(notification);
  if (!messageId) return undefined;
  const date = new Date(notification.createdAt);
  const params = notification.params;
  const twoFactor = TWO_FACTOR_MESSAGE.exec(messageId);
  if (twoFactor) {
    return {
      type:
        twoFactor[1] === "enabled"
          ? "two_factor_enabled"
          : "two_factor_disabled",
      date,
      method: twoFactor[2] as TwoFactorMethod,
    };
  }
  switch (messageId) {
    case "new_login":
    case "new_login_unknown_device": {
      const origin = textParam(params, "origin") ?? "";
      const ip = ORIGIN_IP.exec(origin)?.[1]?.trim() || undefined;
      return {
        type: "sign_in",
        date,
        device: textParam(params, "device"),
        ip,
      };
    }
    case "password_changed":
      return { type: "password_changed", date };
    case "password_reset":
      return { type: "password_reset", date };
    case "email_changed":
      return { type: "email_changed", date, email: textParam(params, "email") };
    case "backup_codes_regenerated":
      return { type: "backup_codes_generated", date };
    case "login_method_added":
      return {
        type: "login_method_added",
        date,
        provider: textParam(params, "provider"),
      };
    case "welcome":
      return { type: "account_created", date };
    case "collaborator_joined":
      // The name only: the collaborator's email stays on the notification.
      return {
        type: "collaborator_joined",
        date,
        actor: textParam(params, "name"),
      };
    default:
      return undefined;
  }
}

function sessionToEvent(session: Session, currentSessionId?: string): Draft {
  return {
    type: "session_started",
    date: new Date(session.createdAt),
    browser: session.browser || undefined,
    os: session.os || undefined,
    deviceType: session.deviceType || "desktop",
    ip: session.ip || undefined,
    location: session.location || undefined,
    current: !!currentSessionId && session._id === currentSessionId,
  };
}

function userRowEvents(user: User): Draft[] {
  const events: Draft[] = [];
  if (user.createdAt) {
    events.push({ type: "account_created", date: new Date(user.createdAt) });
  }
  if (user.passwordChangedAt) {
    events.push({
      type: "password_changed",
      date: new Date(user.passwordChangedAt),
    });
  }
  if (user.twoFactorBackupCodesGeneratedAt) {
    events.push({
      type: "backup_codes_generated",
      date: new Date(user.twoFactorBackupCodesGeneratedAt),
    });
  }
  return events;
}

function membershipToEvent({
  member,
  workspace,
  invitedByName,
}: ActivityMembershipSource): Draft {
  return {
    type: "workspace_joined",
    date: new Date(member.joinedAt),
    workspace,
    actor: invitedByName || undefined,
    owner: member.isTenantOwner === true,
  };
}

function inviteToEvent({ invite, workspace }: ActivityInviteSource): Draft {
  return {
    type: "invite_sent",
    date: new Date(invite.createdAt),
    email: invite.email,
    workspace,
  };
}

/**
 * Records of the same event, the richer one kept: a session over the alert
 * of its sign-in; the alert of a password change, reset or backup codes over
 * the bare row timestamp; the welcome alert over the account creation date.
 * Backup codes made by turning two-factor on read as the switch only.
 */
const DUPLICATES: Partial<Record<AccountActivityType, AccountActivityType[]>> =
  {
    sign_in: ["session_started"],
  };
const ROW_SHADOWED_BY: Partial<
  Record<AccountActivityType, AccountActivityType[]>
> = {
  password_changed: ["password_changed", "password_reset"],
  backup_codes_generated: ["backup_codes_generated", "two_factor_enabled"],
  account_created: ["account_created"],
};

const within = (a: Draft, b: Draft): boolean =>
  Math.abs(a.date.getTime() - b.date.getTime()) <= ACTIVITY_DEDUPE_WINDOW_MS;

/**
 * Drops the second record of an event: an alert whose session is listed, a
 * row timestamp whose alert is listed.
 *
 * @param notifications Events read from notifications
 * @param records Events read from rows (sessions, user, memberships, invites)
 * @param rowEvents Events read from the user row's timestamps
 */
export function dedupeActivity(
  notifications: Draft[],
  records: Draft[],
  rowEvents: Draft[],
): Draft[] {
  const keptNotifications = notifications.filter(
    (event) =>
      !records.some(
        (record) =>
          DUPLICATES[event.type]?.includes(record.type) &&
          within(event, record),
      ),
  );
  const keptRows = rowEvents.filter(
    (event) =>
      !keptNotifications.some(
        (notification) =>
          ROW_SHADOWED_BY[event.type]?.includes(notification.type) &&
          within(event, notification),
      ),
  );
  return [...keptNotifications, ...records, ...keptRows];
}

/**
 * The latest events of the user's account, newest first, at most `limit`.
 * Events without a valid date are left out.
 */
export function buildAccountActivity(
  sources: AccountActivitySources,
  limit: number = ACCOUNT_ACTIVITY_LIMIT,
): AccountActivityEvent[] {
  const notifications = sources.notifications
    .filter((notification) => notification.userId === sources.user._id)
    .map(notificationToEvent)
    .filter((event): event is Draft => !!event);
  const records = [
    ...sources.sessions
      .filter((session) => session.userId === String(sources.user._id))
      .map((session) => sessionToEvent(session, sources.currentSessionId)),
    ...sources.memberships
      .filter(({ member }) => member.userId === sources.user._id)
      .map(membershipToEvent),
    ...sources.invites
      .filter(({ invite }) => invite.invitedBy === sources.user._id)
      .map(inviteToEvent),
  ];
  const merged = dedupeActivity(
    notifications,
    records,
    userRowEvents(sources.user),
  );
  return merged
    .filter((event) => Number.isFinite(toTime(event.date)))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, Math.max(0, limit))
    .map((event, index) => ({
      id: `${event.type}-${event.date.getTime()}-${index}`,
      ...stripEmpty(event),
    }));
}

function stripEmpty(event: Draft): Draft {
  return Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== undefined),
  ) as Draft;
}
