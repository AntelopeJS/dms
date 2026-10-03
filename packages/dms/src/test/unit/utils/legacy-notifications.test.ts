import { expect } from "chai";
import {
  needsAccountEmail,
  splitLegacyDevice,
  type StoredNotification,
  upgradeLegacyNotification,
} from "../../../utils/legacy-notifications";

const PREFIX = "$dms.notifications.messages";

function stored(
  messageId: string,
  params: StoredNotification["params"],
  description: string | null = `${PREFIX}.${messageId}.description`,
): StoredNotification {
  return { title: `${PREFIX}.${messageId}.title`, description, params };
}

describe("[unit] utils/legacy-notifications", () => {
  it("moves the IP of an old sign-in alert into its own param", () => {
    const row = stored("new_login", {
      device: "Chrome on Windows",
      origin: " (127.0.0.1)",
    });
    expect(upgradeLegacyNotification(row)).to.deep.equal({
      title: `${PREFIX}.new_login.title_browser_os`,
      params: { browser: "Chrome", os: "Windows", ip: "127.0.0.1" },
      description: `${PREFIX}.new_login.description`,
    });
  });

  it("splits an old alert's English device into the browser and the system", () => {
    const row = stored("new_login", {
      device: "Firefox on Windows",
      ip: "127.0.0.1",
    });
    expect(upgradeLegacyNotification(row)).to.deep.equal({
      title: `${PREFIX}.new_login.title_browser_os`,
      params: { browser: "Firefox", os: "Windows", ip: "127.0.0.1" },
      description: `${PREFIX}.new_login.description`,
    });
    const withoutIp = stored(
      "new_login",
      { device: "Mobile Safari on iOS" },
      `${PREFIX}.new_login.description_no_ip`,
    );
    expect(upgradeLegacyNotification(withoutIp)).to.deep.equal({
      title: `${PREFIX}.new_login.title_browser_os`,
      params: { browser: "Mobile Safari", os: "iOS" },
      description: `${PREFIX}.new_login.description_no_ip`,
    });
  });

  it("keeps the device of an old alert that named one part only", () => {
    const row = stored("new_login", { device: "Windows", ip: "1.2.3.4" });
    expect(upgradeLegacyNotification(row)).to.equal(undefined);
  });

  it("is idempotent: a split alert is current", () => {
    const row = stored("new_login", {
      device: "Chrome on Windows",
      ip: "127.0.0.1",
    });
    const patch = upgradeLegacyNotification(row);
    expect(upgradeLegacyNotification({ ...row, ...patch })).to.equal(undefined);
  });

  describe("splitLegacyDevice", () => {
    it("reads one connector between two names", () => {
      expect(splitLegacyDevice("Chrome on Windows")).to.deep.equal({
        browser: "Chrome",
        os: "Windows",
      });
      expect(splitLegacyDevice("Samsung Internet on Android")).to.deep.equal({
        browser: "Samsung Internet",
        os: "Android",
      });
    });

    it("refuses what it cannot split reliably", () => {
      expect(splitLegacyDevice("Chrome")).to.equal(undefined);
      expect(splitLegacyDevice("A on B on C")).to.equal(undefined);
      expect(splitLegacyDevice(" on Windows")).to.equal(undefined);
      expect(splitLegacyDevice("Chrome on ")).to.equal(undefined);
      expect(splitLegacyDevice(undefined)).to.equal(undefined);
      expect(splitLegacyDevice(42)).to.equal(undefined);
    });
  });

  it("picks the wording without an IP when the old alert had none", () => {
    const row = stored("new_login_unknown_device", { origin: "" });
    expect(upgradeLegacyNotification(row)).to.deep.equal({
      params: {},
      description: `${PREFIX}.new_login_unknown_device.description_no_ip`,
    });
  });

  it("repairs a sign-in alert whose description was lost", () => {
    const row = stored("new_login", { device: "Chrome", ip: "1.2.3.4" }, null);
    expect(upgradeLegacyNotification(row)).to.deep.equal({
      description: `${PREFIX}.new_login.description`,
    });
  });

  it("leaves a current sign-in alert alone", () => {
    const row = {
      title: `${PREFIX}.new_login.title_browser_os`,
      description: `${PREFIX}.new_login.description`,
      params: { browser: "Firefox", os: "Linux", ip: "127.0.0.1" },
    };
    expect(upgradeLegacyNotification(row)).to.equal(undefined);
    const withoutIp = stored(
      "new_login",
      { device: "Chrome" },
      `${PREFIX}.new_login.description_no_ip`,
    );
    expect(upgradeLegacyNotification(withoutIp)).to.equal(undefined);
  });

  it("adds the account address to an old password reset alert", () => {
    const row = stored("password_reset", null);
    expect(needsAccountEmail(row)).to.equal(true);
    expect(upgradeLegacyNotification(row, "ada@example.com")).to.deep.equal({
      params: { email: "ada@example.com" },
    });
    expect(upgradeLegacyNotification(row)).to.equal(undefined);
    expect(
      needsAccountEmail(stored("password_reset", { email: "a@b.c" })),
    ).to.equal(false);
  });

  it("words a backup codes alert after the count it holds", () => {
    expect(
      upgradeLegacyNotification(stored("backup_codes_regenerated", null, null)),
    ).to.deep.equal({
      description: `${PREFIX}.backup_codes_regenerated.description_none`,
    });
    expect(
      upgradeLegacyNotification(
        stored("backup_codes_regenerated", { count: 10 }),
      ),
    ).to.equal(undefined);
    expect(
      upgradeLegacyNotification(
        stored("backup_codes_regenerated", { count: 1 }),
      ),
    ).to.deep.equal({
      description: `${PREFIX}.backup_codes_regenerated.description_one`,
    });
  });

  it("ignores other notifications", () => {
    expect(
      upgradeLegacyNotification(
        stored("collaborator_joined", { name: "Ada", email: "a@b.c" }),
      ),
    ).to.equal(undefined);
    expect(
      upgradeLegacyNotification({ title: "Plain title", params: null }),
    ).to.equal(undefined);
  });

  it("recolours the notifications the tone grid changed", () => {
    const toneOf = (row: StoredNotification) =>
      upgradeLegacyNotification(row)?.tone;
    expect(
      toneOf({ ...stored("failed_sign_ins", { count: 5 }), tone: "warning" }),
    ).to.equal("error");
    expect(
      toneOf({ ...stored("password_changed", null), tone: "neutral" }),
    ).to.equal("warning");
    expect(
      toneOf({ ...stored("login_method_added", null), tone: "neutral" }),
    ).to.equal("warning");
    expect(toneOf(stored("welcome", { name: "Ada" }))).to.equal("success");
    expect(toneOf(stored("invite_accepted", { name: "Ada" }))).to.equal(
      "success",
    );
    expect(toneOf(stored("invite_expired", { email: "a@b.c" }))).to.equal(
      "accent",
    );
    expect(toneOf(stored("module_updates", { count: 2 }))).to.equal("accent");
    expect(
      toneOf(stored("role_permissions_changed", { role: "Editor" })),
    ).to.equal("accent");
  });

  it("colours a backup code alert after the codes left", () => {
    const used = (left: number): StoredNotification => ({
      ...stored("backup_code_used", { left }),
      tone: "warning",
    });
    expect(upgradeLegacyNotification(used(5))).to.equal(undefined);
    expect(upgradeLegacyNotification(used(2))).to.deep.equal({ tone: "error" });
    expect(upgradeLegacyNotification(used(0))).to.deep.equal({ tone: "error" });
  });

  it("warns a member left without any role, and only them", () => {
    const none: StoredNotification = {
      title: `${PREFIX}.roles_changed.title_none`,
      description: `${PREFIX}.roles_changed.description`,
      params: { roles: "", actor: "Ada" },
      tone: "neutral",
    };
    expect(upgradeLegacyNotification(none)).to.deep.equal({ tone: "warning" });
    expect(
      upgradeLegacyNotification({
        ...none,
        title: `${PREFIX}.roles_changed.title_one`,
        params: { roles: "Editor", actor: "Ada" },
      }),
    ).to.equal(undefined);
  });

  it("leaves a row already in its current tone alone", () => {
    expect(
      upgradeLegacyNotification({
        ...stored("welcome", { name: "Ada" }),
        tone: "success",
      }),
    ).to.equal(undefined);
  });
});
