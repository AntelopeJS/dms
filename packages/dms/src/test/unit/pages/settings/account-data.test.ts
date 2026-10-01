import { expect } from "chai";
import type {
  Session,
  User,
  UserExternalIdentity,
} from "@antelopejs/interface-dms/auth/db";
import type { TenantMember, UserInvite } from "@antelopejs/interface-dms/db";
import type { UserNotification } from "../../../../db";
import {
  ACCOUNT_EXPORT_FORMAT,
  type AccountMembershipSource,
  AccountExportThrottle,
  buildAccountExport,
  findDeletionBlockers,
  isDeletionConfirmed,
} from "../../../../pages/settings/users/account-data";

const USER_ID = "account-data-user";
const PASSWORD_HASH = "$2b$10$secret-password-hash";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP-totp-secret";
const PENDING_SECRET = "pending-totp-secret";
const BACKUP_CODE_HASH = "backup-code-hash-1";
const EMAIL_CODE = "482913";
const AUTH_KEY = "auth-key-secret";
const VALIDATION_TOKEN = "validation-token-secret";
const RESET_TOKEN = "forgot-password-token-secret";
const REFRESH_TOKEN = "refresh-token-secret";
const REFRESH_HASH = "refresh-token-hash-secret";
const SEALED_REFRESH = "sealed-refresh-secret";
const INVITE_TOKEN = "invite-token-secret";
const PROVIDER_ACCOUNT = "provider-account-id-123";
const EXPORTED_AT = new Date("2026-10-01T12:00:00Z");
const SECRETS = [
  PASSWORD_HASH,
  TOTP_SECRET,
  PENDING_SECRET,
  BACKUP_CODE_HASH,
  EMAIL_CODE,
  AUTH_KEY,
  VALIDATION_TOKEN,
  RESET_TOKEN,
  REFRESH_TOKEN,
  REFRESH_HASH,
  SEALED_REFRESH,
  INVITE_TOKEN,
];

function storedUser(): User {
  return {
    _id: USER_ID,
    createdAt: new Date("2025-03-12T09:00:00Z"),
    updatedAt: new Date("2026-09-30T09:00:00Z"),
    email: "camille@acme.dev",
    name: "Camille Laurent",
    avatar: { key: "avatars/camille.webp" },
    language: "fr",
    timeZone: "Europe/Brussels",
    weekStart: 1,
    timeFormat: "h23",
    dateFormat: null,
    password: PASSWORD_HASH,
    passwordChangedAt: new Date("2026-01-01T00:00:00Z"),
    authKey: AUTH_KEY,
    isValidated: true,
    validationToken: VALIDATION_TOKEN,
    validationRequestedAt: null,
    forgotPasswordToken: RESET_TOKEN,
    forgotPasswordRequestedAt: null,
    owner: false,
    lastActiveAt: new Date("2026-09-30T10:00:00Z"),
    twoFactorMethods: ["totp"],
    twoFactorSecret: TOTP_SECRET,
    twoFactorPendingSecret: PENDING_SECRET,
    twoFactorBackupCodes: [BACKUP_CODE_HASH],
    twoFactorBackupCodesGeneratedAt: null,
    twoFactorBackupCodesSavedAt: null,
    twoFactorEmailCode: EMAIL_CODE,
    twoFactorEmailCodeRequestedAt: null,
  } as unknown as User;
}

function membership(
  overrides: Partial<AccountMembershipSource> & { isTenantOwner?: boolean },
): AccountMembershipSource {
  return {
    tenantId: "acme",
    tenantName: "Acme",
    roleNames: ["Editor"],
    otherOwners: 0,
    ...overrides,
    member: {
      _id: `acme:${USER_ID}`,
      userId: USER_ID,
      roleIds: ["editor"],
      isTenantOwner: overrides.isTenantOwner ?? false,
      joinedAt: new Date("2025-03-12T09:00:00Z"),
      invitedBy: "someone",
    } as TenantMember,
  };
}

function exportOf(user: User) {
  return buildAccountExport({
    user,
    notificationPreferences: { "security.sign_in": true },
    memberships: [membership({ isTenantOwner: true, otherOwners: 2 })],
    notifications: [
      {
        _id: "n1",
        userId: USER_ID,
        icon: "i-ph-bell",
        title: "New sign-in",
        description: "Chrome on Windows",
        linkTo: null,
        params: null,
        tone: null,
        isRead: false,
        categoryId: "security",
        subjectId: "sign_in",
        groupId: null,
        createdAt: EXPORTED_AT,
        updatedAt: EXPORTED_AT,
      } as UserNotification,
    ],
    sessions: [
      {
        _id: "s1",
        userId: USER_ID,
        refreshToken: REFRESH_TOKEN,
        refreshTokenHash: REFRESH_HASH,
        sealedRefreshToken: SEALED_REFRESH,
        previousRefreshTokenHash: REFRESH_HASH,
        userAgent: "Mozilla/5.0",
        ip: "127.0.0.1",
        browser: "Chrome",
        os: "Windows",
        deviceType: "desktop",
        location: "",
        createdAt: EXPORTED_AT,
        lastActiveAt: EXPORTED_AT,
      } as Session,
    ],
    identities: [
      {
        _id: "i1",
        userId: USER_ID,
        provider: "google",
        providerAccountId: PROVIDER_ACCOUNT,
        email: "camille@gmail.com",
        createdAt: EXPORTED_AT,
        lastLoginAt: EXPORTED_AT,
      } as UserExternalIdentity,
    ],
    invitesSent: [
      {
        tenantId: "acme",
        roleNames: ["Viewer"],
        invite: {
          _id: "inv1",
          email: "new@acme.dev",
          firstname: "Noa",
          lastname: null,
          roles_ids: ["viewer"],
          token: INVITE_TOKEN,
          asTenantOwner: false,
          createdAt: EXPORTED_AT,
          expiresAt: new Date("2026-10-08T12:00:00Z"),
        } as unknown as UserInvite,
      },
    ],
    exportedAt: EXPORTED_AT,
  });
}

describe("[unit] account data — the export file", () => {
  it("carries no password, two-factor secret, code or token", () => {
    const serialized = JSON.stringify(exportOf(storedUser()));
    for (const secret of SECRETS) {
      expect(serialized, secret).not.to.contain(secret);
    }
  });

  it("names its format and lists every kind of row", () => {
    const file = exportOf(storedUser());
    expect(file.format).to.equal(ACCOUNT_EXPORT_FORMAT);
    expect(file.profile).to.include({
      id: USER_ID,
      email: "camille@acme.dev",
      hasPassword: true,
      avatar: "avatars/camille.webp",
    });
    expect(file.profile.twoFactorMethods).to.deep.equal(["totp"]);
    expect(file.preferences).to.deep.include({
      language: "fr",
      timeZone: "Europe/Brussels",
      weekStart: 1,
      dateFormat: null,
    });
    expect(file.preferences.notifications).to.deep.equal({
      "security.sign_in": true,
    });
    expect(file.memberships[0]).to.include({
      tenantName: "Acme",
      isTenantOwner: true,
    });
    expect(file.sessions[0]).to.include({ browser: "Chrome", ip: "127.0.0.1" });
    expect(file.externalIdentities[0]).to.deep.equal({
      provider: "google",
      email: "camille@gmail.com",
      linkedAt: EXPORTED_AT,
      lastLoginAt: EXPORTED_AT,
    });
    expect(file.invitesSent[0]).to.include({
      email: "new@acme.dev",
      status: "pending",
    });
  });

  it("exports a field added to the user only once it is picked", () => {
    const user = Object.assign(storedUser(), { apiSecret: "leak-me" });
    expect(JSON.stringify(exportOf(user))).not.to.contain("leak-me");
  });
});

describe("[unit] account data — deletion guards", () => {
  const NOT_PLATFORM_OWNER = { isPlatformOwner: false, otherPlatformOwners: 0 };

  it("refuses the last owner of a workspace", () => {
    expect(
      findDeletionBlockers(
        [membership({ isTenantOwner: true, otherOwners: 0 })],
        NOT_PLATFORM_OWNER,
      ),
    ).to.deep.equal([{ kind: "tenant", tenantId: "acme", tenantName: "Acme" }]);
  });

  it("lets an owner go once another member owns the workspace", () => {
    expect(
      findDeletionBlockers(
        [
          membership({ isTenantOwner: true, otherOwners: 1 }),
          membership({ tenantId: "beta", isTenantOwner: false }),
        ],
        NOT_PLATFORM_OWNER,
      ),
    ).to.deep.equal([]);
  });

  it("refuses the last platform owner", () => {
    expect(
      findDeletionBlockers([], {
        isPlatformOwner: true,
        otherPlatformOwners: 0,
      }),
    ).to.deep.equal([{ kind: "platform" }]);
    expect(
      findDeletionBlockers([], {
        isPlatformOwner: true,
        otherPlatformOwners: 1,
      }),
    ).to.deep.equal([]);
  });

  it("takes the account's e-mail, in any case, as confirmation", () => {
    const user = storedUser();
    expect(isDeletionConfirmed(user, " Camille@ACME.dev ")).to.equal(true);
    expect(isDeletionConfirmed(user, "camille@acme.io")).to.equal(false);
  });
});

describe("[unit] account data — export throttle", () => {
  const WINDOW_MS = 10_000;

  it("allows one export per user per window", () => {
    const throttle = new AccountExportThrottle(WINDOW_MS);
    expect(throttle.tryAcquire("a", 0)).to.equal(true);
    expect(throttle.tryAcquire("a", WINDOW_MS - 1)).to.equal(false);
    expect(throttle.tryAcquire("b", 1)).to.equal(true);
    expect(throttle.tryAcquire("a", WINDOW_MS)).to.equal(true);
  });
});
