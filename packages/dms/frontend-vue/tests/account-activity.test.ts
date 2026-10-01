import { describe, expect, it } from "vitest";
import {
  type AccountActivityEvent,
  activityViewAllPage,
  buildAccountActivityRows,
  translateActivityText,
} from "../layers/dms-layout/app/composables/settings/activity/buildAccountActivity";

const ALL_PAGES = {
  "settings.user.profile": "/settings/user/profile",
  "settings.user.security": "/settings/user/security",
  "settings.user.notifications": "/settings/user/notifications",
  "settings.user.members": "/settings/user/members",
  "settings.user.members.invites": "/settings/user/members/invites",
};
const PROFILE_ONLY = { "settings.user.profile": "/settings/user/profile" };

// Echoes the key and its params, so assertions read the whole text.
const t = (key: string, params?: Record<string, string>) =>
  params ? `${key}(${JSON.stringify(params)})` : key;

const event = (
  type: string,
  overrides: Partial<AccountActivityEvent> = {},
): AccountActivityEvent => ({
  id: `${type}-1`,
  type,
  date: "2026-09-30T10:00:00.000Z",
  ...overrides,
});

describe("buildAccountActivityRows", () => {
  it("keeps the backend order and skips unknown event types", () => {
    const rows = buildAccountActivityRows(
      [
        event("password_changed", { id: "a" }),
        event("module_installed", { id: "b" }),
        event("account_created", { id: "c" }),
      ],
      ALL_PAGES,
    );
    expect(rows.map((row) => row.id)).toEqual(["a", "c"]);
  });

  it("names the session's device and flags this device", () => {
    const [row] = buildAccountActivityRows(
      [
        event("session_started", {
          browser: "Chrome 150.0.7871.250",
          os: "Windows 10",
          deviceType: "mobile",
          ip: "203.0.113.7",
          location: "Brussels, BE",
          current: true,
        }),
      ],
      ALL_PAGES,
    );
    expect(row?.icon).toBe("i-ph-device-mobile");
    expect(row?.tone).toBe("accent");
    expect(translateActivityText(row!.title, t)).toBe(
      'page.settings.overview.activity.event.signed_in_on({"device":"page.settings.overview.activity.device({\\"browser\\":\\"Chrome\\",\\"os\\":\\"Windows 10\\"})"})',
    );
    expect(row?.meta.map((entry) => translateActivityText(entry, t))).toEqual([
      "Brussels, BE",
      "203.0.113.7",
      "page.settings.overview.activity.this_device",
    ]);
    expect(row?.to).toBe("/settings/user/security#sessions");
  });

  it("falls back to a generic title when a detail is missing", () => {
    const rows = buildAccountActivityRows(
      [
        event("session_started"),
        event("session_started", { browser: "Unknown", os: "Unknown" }),
        event("sign_in"),
        event("invite_sent"),
        event("collaborator_joined"),
      ],
      ALL_PAGES,
    );
    expect(rows.map((row) => translateActivityText(row.title, t))).toEqual([
      "page.settings.overview.activity.event.signed_in",
      "page.settings.overview.activity.event.signed_in",
      "page.settings.overview.activity.event.signed_in",
      "page.settings.overview.activity.event.invite_sent_unnamed",
      "page.settings.overview.activity.event.collaborator_joined_unnamed",
    ]);
    expect(rows[0]?.icon).toBe("i-ph-desktop");
  });

  it("gives each type its tone, details and page", () => {
    const rows = buildAccountActivityRows(
      [
        event("two_factor_disabled", { method: "email" }),
        event("two_factor_enabled", { method: "sms" }),
        event("workspace_joined", { workspace: "Acme", actor: "Léa" }),
        event("workspace_joined", { workspace: "Acme", owner: true }),
        event("invite_sent", { email: "jules@acme.dev", workspace: "Acme" }),
      ],
      ALL_PAGES,
    );
    expect(rows.map((row) => row.tone)).toEqual([
      "warning",
      "success",
      "accent",
      "accent",
      "secondary",
    ]);
    expect(
      rows.map((row) =>
        row.meta.map((entry) => translateActivityText(entry, t)),
      ),
    ).toEqual([
      ["page.settings.overview.activity.method.email"],
      [],
      ['page.settings.overview.activity.invited_by({"name":"Léa"})'],
      ["page.settings.overview.activity.as_owner"],
      ["Acme"],
    ]);
    expect(rows.map((row) => row.to)).toEqual([
      "/settings/user/security#two-factor",
      "/settings/user/security#two-factor",
      "/settings/user/members",
      "/settings/user/members",
      "/settings/user/members/invites",
    ]);
  });

  it("links only to the pages the viewer can open", () => {
    const rows = buildAccountActivityRows(
      [event("password_changed"), event("account_created")],
      PROFILE_ONLY,
    );
    expect(rows[0]?.to).toBeUndefined();
    expect(rows[0]?.pageId).toBeUndefined();
    expect(rows[1]).toMatchObject({
      to: "/settings/user/profile",
      pageId: "settings.user.profile",
    });
  });
});

describe("activityViewAllPage", () => {
  it("prefers the notifications inbox, then Security, else nothing", () => {
    expect(activityViewAllPage(ALL_PAGES)?.to).toBe(
      "/settings/user/notifications",
    );
    expect(
      activityViewAllPage({
        "settings.user.security": "/settings/user/security",
      })?.pageId,
    ).toBe("settings.user.security");
    expect(activityViewAllPage(PROFILE_ONLY)).toBeUndefined();
  });
});
