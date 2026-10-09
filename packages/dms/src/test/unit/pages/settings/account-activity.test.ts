import { expect } from "chai";
import type { Session, User } from "@antelopejs/interface-dms/auth/db";
import type { TenantMember, UserInvite } from "@antelopejs/interface-dms/db";
import type { UserNotification } from "../../../../db";
import {
  ACCOUNT_ACTIVITY_LIMIT,
  type AccountActivitySources,
  buildAccountActivity,
  notificationToEvent,
} from "../../../../pages/settings/users/account-activity";

const USER_ID = "activity-user";
const OTHER_ID = "someone-else";
const PASSWORD_HASH = "$2b$10$secret-password-hash";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP-totp-secret";
const BACKUP_CODE_HASH = "backup-code-hash-1";
const AUTH_KEY = "auth-key-secret";
const REFRESH_TOKEN = "refresh-token-secret";
const REFRESH_HASH = "refresh-token-hash-secret";
const INVITE_TOKEN = "invite-token-secret";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0) secret-agent";
const COLLABORATOR_EMAIL = "jules@acme.dev";
const SECRETS = [
  PASSWORD_HASH,
  TOTP_SECRET,
  BACKUP_CODE_HASH,
  AUTH_KEY,
  REFRESH_TOKEN,
  REFRESH_HASH,
  INVITE_TOKEN,
  USER_AGENT,
  COLLABORATOR_EMAIL,
];

const at = (iso: string) => new Date(iso);
/** A cap below the events the merge test builds, so it drops the oldest. */
const SHORT_LIMIT = 6;

function user(overrides: Partial<User> = {}): User {
  return {
    _id: USER_ID,
    createdAt: at("2025-03-12T09:00:00Z"),
    email: "camille@acme.dev",
    name: "Camille",
    password: PASSWORD_HASH,
    passwordChangedAt: null,
    authKey: AUTH_KEY,
    twoFactorSecret: TOTP_SECRET,
    twoFactorBackupCodes: [BACKUP_CODE_HASH],
    twoFactorBackupCodesGeneratedAt: null,
    ...overrides,
  } as unknown as User;
}

function session(id: string, createdAt: string, userId = USER_ID): Session {
  return {
    _id: id,
    userId,
    refreshToken: REFRESH_TOKEN,
    refreshTokenHash: REFRESH_HASH,
    userAgent: USER_AGENT,
    ip: "203.0.113.7",
    browser: "Chrome 150.0",
    os: "Windows",
    deviceType: "desktop",
    location: "Brussels, BE",
    createdAt: at(createdAt),
    lastActiveAt: at(createdAt),
  } as Session;
}

function notification(
  messageId: string,
  createdAt: string,
  params: Record<string, string> | null = null,
  overrides: Partial<UserNotification> = {},
): UserNotification {
  return {
    _id: `n-${messageId}-${createdAt}`,
    userId: USER_ID,
    icon: "i-ph-bell",
    title: `$dms.notifications.messages.${messageId}.title`,
    description: `$dms.notifications.messages.${messageId}.description`,
    linkTo: "/settings/user/security",
    params,
    tone: null,
    isRead: false,
    categoryId: "system",
    subjectId: "security",
    groupId: null,
    createdAt: at(createdAt),
    updatedAt: at(createdAt),
    ...overrides,
  } as UserNotification;
}

function sources(
  overrides: Partial<AccountActivitySources> = {},
): AccountActivitySources {
  return {
    user: user(),
    sessions: [],
    notifications: [],
    memberships: [],
    invites: [],
    ...overrides,
  };
}

describe("account activity", () => {
  it("maps each account notification the DMS sends to its event", () => {
    expect(
      notificationToEvent(
        notification("new_login", "2026-09-30T10:00:00Z", {
          device: "Firefox on Linux",
          origin: " (198.51.100.4)",
        }),
      ),
    ).to.deep.include({
      type: "sign_in",
      device: "Firefox on Linux",
      ip: "198.51.100.4",
    });
    expect(
      notificationToEvent(
        notification(
          "new_login",
          "2026-09-30T10:00:00Z",
          { browser: "Firefox", os: "Linux", ip: "198.51.100.4" },
          {
            title: "$dms.notifications.messages.new_login.title_browser_os",
          },
        ),
      ),
    ).to.deep.include({
      type: "sign_in",
      browser: "Firefox",
      os: "Linux",
      ip: "198.51.100.4",
    });
    expect(
      notificationToEvent(
        notification("two_factor_disabled_email", "2026-09-30T10:00:00Z"),
      ),
    ).to.deep.include({ type: "two_factor_disabled", method: "email" });
    expect(
      notificationToEvent(
        notification("email_changed", "2026-09-30T10:00:00Z", {
          email: "new@acme.dev",
        }),
      ),
    ).to.deep.include({ type: "email_changed", email: "new@acme.dev" });
    expect(
      notificationToEvent(
        notification("welcome", "2026-09-30T10:00:00Z", null, {
          subjectId: "account",
        }),
      )?.type,
    ).to.equal("account_created");
  });

  it("ignores notifications outside the account subjects or unknown", () => {
    expect(
      notificationToEvent(
        notification("password_changed", "2026-09-30T10:00:00Z", null, {
          subjectId: "automation",
        }),
      ),
    ).to.equal(undefined);
    expect(
      notificationToEvent(
        notification("module_update", "2026-09-30T10:00:00Z"),
      ),
    ).to.equal(undefined);
    expect(
      notificationToEvent(
        notification("x", "2026-09-30T10:00:00Z", null, {
          title: "Plain title",
        }),
      ),
    ).to.equal(undefined);
  });

  it("merges every source newest first and caps the list", () => {
    const events = buildAccountActivity(
      sources({
        user: user({
          passwordChangedAt: at("2026-09-20T08:00:00Z"),
          twoFactorBackupCodesGeneratedAt: at("2026-09-10T08:00:00Z"),
        }),
        sessions: [
          session("s1", "2026-09-30T09:00:00Z"),
          session("s2", "2026-09-28T09:00:00Z"),
        ],
        notifications: [
          notification("two_factor_enabled_totp", "2026-09-25T08:00:00Z"),
        ],
        memberships: [
          {
            member: {
              _id: "m1",
              userId: USER_ID,
              roleIds: [],
              isTenantOwner: true,
              joinedAt: at("2025-03-12T09:00:00Z"),
              invitedBy: null,
            } as TenantMember,
            workspace: "Acme",
          },
        ],
        invites: [
          {
            invite: {
              _id: "i1",
              email: "lea@acme.dev",
              invitedBy: USER_ID,
              token: INVITE_TOKEN,
              createdAt: at("2026-09-29T09:00:00Z"),
            } as unknown as UserInvite,
            workspace: "Acme",
          },
        ],
        currentSessionId: "s1",
      }),
      SHORT_LIMIT,
    );
    expect(events.map((event) => event.type)).to.deep.equal([
      "session_started",
      "invite_sent",
      "session_started",
      "two_factor_enabled",
      "password_changed",
      "backup_codes_generated",
    ]);
    expect(events).to.have.length(SHORT_LIMIT);
    expect(events[0]).to.deep.include({
      current: true,
      browser: "Chrome 150.0",
      ip: "203.0.113.7",
      location: "Brussels, BE",
    });
    expect(events[2]?.current).to.equal(false);
    expect(events[1]).to.deep.include({
      email: "lea@acme.dev",
      workspace: "Acme",
    });
    expect(new Set(events.map((event) => event.id)).size).to.equal(
      events.length,
    );
  });

  it("shows the latest 20 events by default", () => {
    const sessions = Array.from({ length: 25 }, (_, index) =>
      session(
        `s${index}`,
        new Date(Date.UTC(2026, 8, 1 + index, 9)).toISOString(),
      ),
    );
    const events = buildAccountActivity(sources({ sessions }));
    expect(ACCOUNT_ACTIVITY_LIMIT).to.equal(20);
    expect(events).to.have.length(ACCOUNT_ACTIVITY_LIMIT);
    expect(events[0]?.date).to.deep.equal(at("2026-09-25T09:00:00Z"));
    expect(events.at(-1)?.date).to.deep.equal(at("2026-09-06T09:00:00Z"));
  });

  it("keeps one entry per event across its records", () => {
    const events = buildAccountActivity(
      sources({
        user: user({
          createdAt: at("2026-09-01T08:00:00Z"),
          passwordChangedAt: at("2026-09-20T08:00:00Z"),
          twoFactorBackupCodesGeneratedAt: at("2026-09-25T08:00:10Z"),
        }),
        sessions: [session("s1", "2026-09-30T09:00:00Z")],
        notifications: [
          notification("new_login", "2026-09-30T09:00:03Z", {
            device: "Chrome on Windows",
            origin: " (203.0.113.7)",
          }),
          // A sign-in whose session has ended: still listed.
          notification("new_login", "2026-09-29T07:00:00Z", {
            device: "Safari on iOS",
          }),
          notification("password_changed", "2026-09-20T08:00:01Z"),
          notification("two_factor_enabled_totp", "2026-09-25T08:00:12Z"),
          notification("welcome", "2026-09-01T08:00:02Z", null, {
            subjectId: "account",
          }),
        ],
      }),
      20,
    );
    expect(events.map((event) => event.type)).to.deep.equal([
      "session_started",
      "sign_in",
      "two_factor_enabled",
      "password_changed",
      "account_created",
    ]);
    expect(events[1]).to.deep.include({ device: "Safari on iOS" });
  });

  it("returns only the user's own events, without secrets", () => {
    const events = buildAccountActivity(
      sources({
        sessions: [
          session("mine", "2026-09-30T09:00:00Z"),
          session("theirs", "2026-09-30T10:00:00Z", OTHER_ID),
        ],
        notifications: [
          notification("password_changed", "2026-09-30T11:00:00Z", null, {
            userId: OTHER_ID,
          }),
          notification(
            "collaborator_joined",
            "2026-09-30T08:00:00Z",
            { name: "Jules", email: COLLABORATOR_EMAIL },
            { subjectId: "collaboration" },
          ),
        ],
        invites: [
          {
            invite: {
              _id: "i2",
              email: "theirs@acme.dev",
              invitedBy: OTHER_ID,
              createdAt: at("2026-09-30T12:00:00Z"),
            } as unknown as UserInvite,
            workspace: "Acme",
          },
        ],
      }),
    );
    expect(events.map((event) => event.type)).to.deep.equal([
      "session_started",
      "collaborator_joined",
      "account_created",
    ]);
    expect(events[1]).to.deep.include({ actor: "Jules" });
    const serialized = JSON.stringify(events);
    for (const secret of SECRETS) expect(serialized).not.to.include(secret);
    expect(serialized).not.to.include("theirs");
    expect(serialized).not.to.include("refreshToken");
    expect(serialized).not.to.include("userAgent");
  });

  it("leaves out events without a valid date", () => {
    const events = buildAccountActivity(
      sources({
        user: user({ createdAt: undefined as unknown as Date }),
        sessions: [session("bad", "not a date")],
      }),
    );
    expect(events).to.deep.equal([]);
  });
});
