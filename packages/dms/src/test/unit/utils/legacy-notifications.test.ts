import { expect } from "chai";
import {
  needsAccountEmail,
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
      params: { device: "Chrome on Windows", ip: "127.0.0.1" },
      description: `${PREFIX}.new_login.description`,
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
      upgradeLegacyNotification(stored("welcome", { name: "Ada" })),
    ).to.equal(undefined);
    expect(
      upgradeLegacyNotification({ title: "Plain title", params: null }),
    ).to.equal(undefined);
  });
});
