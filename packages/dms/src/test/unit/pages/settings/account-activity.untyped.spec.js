import { expect } from "chai";
import { buildAccountActivity } from "../../../../pages/account";
import { sessionFixture } from "../../../helpers/table-fixtures";
import { plainPasswordUserFixture } from "../../../helpers/user-fixture";

const USER_ID = "activity-user";
const PASSWORD_HASH = "$2b$10$secret-password-hash";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP-totp-secret";
const BACKUP_CODE_HASH = "backup-code-hash-1";
const AUTH_KEY = "auth-key-secret";
const REFRESH_TOKEN = "refresh-token-secret";
const REFRESH_HASH = "refresh-token-hash-secret";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0) secret-agent";

/**
 * @param {string} iso
 */
const at = (iso) => new Date(iso);

/**
 * @param {string} id
 * @param {string} createdAt
 */
function session(id, createdAt) {
  const current = sessionFixture({
    _id: id,
    userId: USER_ID,
    refreshTokenHash: REFRESH_HASH,
    userAgent: USER_AGENT,
    ip: "203.0.113.7",
    browser: "Chrome 150.0",
    os: "Windows",
    deviceType: "desktop",
    location: "Brussels, BE",
    createdAt: at(createdAt),
    lastActiveAt: at(createdAt),
  });
  return Object.assign(current, { refreshToken: REFRESH_TOKEN });
}

describe("account activity", () => {
  it("leaves out events without a valid date", () => {
    const events = buildAccountActivity({
      user: plainPasswordUserFixture({
        _id: USER_ID,
        createdAt: undefined,
        email: "camille@acme.dev",
        name: "Camille",
        password: PASSWORD_HASH,
        passwordChangedAt: null,
        authKey: AUTH_KEY,
        twoFactorSecret: TOTP_SECRET,
        twoFactorBackupCodes: [BACKUP_CODE_HASH],
        twoFactorBackupCodesGeneratedAt: null,
      }),
      sessions: [session("bad", "not a date")],
      notifications: [],
      memberships: [],
      invites: [],
    });
    expect(events).to.deep.equal([]);
  });
});
