import { expect } from "chai";
import type {
  AccountActivityEvent,
  AccountActivityType,
} from "../../../../pages/account";
import { toActivityFeedItems } from "../../../../pages/account";

const TEXTS = "$page.settings.overview.activity";
const ALL_PAGES = {
  "settings.user.profile": "/settings/user/profile",
  "settings.user.security": "/settings/user/security",
  "settings.user.notifications": "/settings/user/notifications",
  "settings.workspace.members": "/settings/workspace/members",
  "settings.workspace.invites": "/settings/workspace/invites",
};
const PROFILE_ONLY = { "settings.user.profile": "/settings/user/profile" };
const EVENT_DATE = "2026-09-30T10:00:00.000Z";

const event = (
  type: AccountActivityType,
  overrides: Partial<AccountActivityEvent> = {},
): AccountActivityEvent => ({
  id: `${type}-1`,
  type,
  date: new Date(EVENT_DATE),
  ...overrides,
});

const UNKNOWN_TYPE: string = "module_installed";

// SAFETY: toActivityFeedItems tests each event's type with Object.hasOwn(LOOKS, type) before it reads LOOKS or any other member, so a type outside AccountActivityType is skipped and never looked up.
const unknownTypeEvent = {
  ...event("password_changed", { id: "b" }),
  type: UNKNOWN_TYPE,
} as AccountActivityEvent;

describe("[unit] settings overview — account activity feed", () => {
  it("keeps the order of the events and skips unknown types", () => {
    const items = toActivityFeedItems(
      [
        event("password_changed", { id: "a" }),
        unknownTypeEvent,
        event("account_created", { id: "c" }),
      ],
      ALL_PAGES,
    );
    expect(items.map((item) => item.id)).to.deep.equal(["a", "c"]);
    expect(items[0]?.date).to.equal(EVENT_DATE);
  });

  it("names the session's device and flags this device", () => {
    const [item] = toActivityFeedItems(
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
    expect(item).to.deep.include({
      icon: "i-ph-device-mobile",
      tone: "primary",
      title: `${TEXTS}.event.signed_in_on`,
      to: "/settings/user/security#sessions",
    });
    expect(item?.params).to.deep.equal({
      device: `${TEXTS}.device`,
      browser: "Chrome",
      os: "Windows 10",
    });
    expect(item?.meta).to.deep.equal([
      "Brussels, BE",
      "203.0.113.7",
      `${TEXTS}.this_device`,
    ]);
  });

  it("falls back to a generic title when a detail is missing", () => {
    const items = toActivityFeedItems(
      [
        event("session_started"),
        event("session_started", { browser: "Unknown", os: "Unknown" }),
        event("sign_in"),
        event("invite_sent"),
        event("collaborator_joined"),
      ],
      ALL_PAGES,
    );
    expect(items.map((item) => item.title)).to.deep.equal([
      `${TEXTS}.event.signed_in`,
      `${TEXTS}.event.signed_in`,
      `${TEXTS}.event.signed_in`,
      `${TEXTS}.event.invite_sent_unnamed`,
      `${TEXTS}.event.collaborator_joined_unnamed`,
    ]);
    expect(items[0]?.icon).to.equal("i-ph-desktop");
    expect(items[0]?.params).to.equal(undefined);
  });

  it("gives each type its tone, details and page", () => {
    const items = toActivityFeedItems(
      [
        event("two_factor_disabled", { method: "email" }),
        event("two_factor_enabled", {
          // SAFETY: twoFactorMeta shows a method only when TWO_FACTOR_METHODS has it, so a method outside TwoFactorMethod yields no detail and is never used as a key.
          method: "sms" as AccountActivityEvent["method"],
        }),
        event("workspace_joined", { workspace: "Acme", actor: "Léa" }),
        event("workspace_joined", { workspace: "Acme", owner: true }),
        event("invite_sent", { email: "jules@acme.dev", workspace: "Acme" }),
      ],
      ALL_PAGES,
    );
    expect(items.map((item) => item.tone)).to.deep.equal([
      "warning",
      "success",
      "primary",
      "primary",
      "secondary",
    ]);
    expect(items.map((item) => item.meta)).to.deep.equal([
      [`${TEXTS}.method.email`],
      undefined,
      [`${TEXTS}.invited_by`],
      [`${TEXTS}.as_owner`],
      ["Acme"],
    ]);
    expect(items[2]?.params).to.deep.equal({ workspace: "Acme", name: "Léa" });
    expect(items.map((item) => item.to)).to.deep.equal([
      "/settings/user/security#two-factor",
      "/settings/user/security#two-factor",
      "/settings/workspace/members",
      "/settings/workspace/members",
      "/settings/workspace/invites",
    ]);
  });

  it("links only to the pages the viewer can open", () => {
    const items = toActivityFeedItems(
      [event("password_changed"), event("account_created")],
      PROFILE_ONLY,
    );
    expect(items[0]?.to).to.equal(undefined);
    expect(items[1]?.to).to.equal("/settings/user/profile");
  });
});
