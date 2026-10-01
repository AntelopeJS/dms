import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import type {
  Session,
  SessionModel,
  User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { sign } from "jsonwebtoken";
import {
  changeEmail,
  changePassword,
  listSessions,
  revokeOtherSessions,
} from "../../../../pages/settings/users/account-credentials";
import {
  getTwoFactorStatus,
  markBackupCodesSaved,
} from "../../../../pages/settings/users/two-factor-operations";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const CURRENT_PASSWORD = "Current1!";
const NEW_PASSWORD = "Antelope26!";
const WEAK_PASSWORD = "antelope";
const USER_ID = "account-security-user";
const OTHER_USER_ID = "account-security-other";
const OWN_EMAIL = "camille@acme.dev";
const TAKEN_EMAIL = "taken@acme.dev";
const FREE_EMAIL = "camille.laurent@acme.dev";
const CURRENT_SESSION = "session-current";
const TOKEN_SIGNING_KEY = "account-security-test";
const BACKUP_CODE_TOTAL = 10;
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";

interface Harness {
  user: User;
  userModel: UserModel;
  sessionModel: SessionModel;
  sessions: Session[];
  updates: number;
}

function buildUser(password: string | null): User {
  return {
    _id: USER_ID,
    email: OWN_EMAIL,
    password,
    createdAt: new Date(0),
    twoFactorMethods: [],
    twoFactorBackupCodes: [],
    // Mirrors HashModifier: the stored hash is compared, never exposed.
    testHash: (_field: string, candidate: string) =>
      candidate === CURRENT_PASSWORD,
  } as unknown as User;
}

function session(id: string, lastActiveAt: number): Session {
  return {
    _id: id,
    userId: USER_ID,
    browser: "Chrome",
    os: "macOS",
    ip: "127.0.0.1",
    deviceType: "desktop",
    location: "",
    createdAt: new Date(0),
    lastActiveAt: new Date(lastActiveAt),
  } as unknown as Session;
}

function buildHarness(password: string | null = "hashed"): Harness {
  const harness = {
    user: buildUser(password),
    sessions: [
      session("session-old", 1),
      session(CURRENT_SESSION, 2),
      session("session-recent", 3),
    ],
    updates: 0,
  } as Harness;
  harness.userModel = {
    get: async () => harness.user,
    getByEmail: async (email: string) =>
      email === TAKEN_EMAIL
        ? ({ _id: OTHER_USER_ID } as unknown as User)
        : undefined,
    update: async () => {
      harness.updates += 1;
    },
  } as unknown as UserModel;
  harness.sessionModel = {
    getByUserId: async () => [...harness.sessions],
    delete: async (id: string) => {
      harness.sessions = harness.sessions.filter((entry) => entry._id !== id);
    },
  } as unknown as SessionModel;
  return harness;
}

const authorization = `Bearer ${sign({ sessionId: CURRENT_SESSION }, TOKEN_SIGNING_KEY)}`;

async function refusal(action: Promise<unknown>): Promise<HTTPResult> {
  const outcome = await action.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (outcome instanceof HTTPResult) return outcome;
  throw new Error(`Expected an HTTP refusal, got ${String(outcome)}`);
}

function passwordChange(harness: Harness, body: Record<string, unknown>) {
  return changePassword(harness.user, body, {
    userModel: harness.userModel,
    sessionModel: harness.sessionModel,
    authorization,
  });
}

describe("[unit] settings/security — password change asks for the current password", () => {
  it("refuses a wrong current password and leaves the account untouched", async () => {
    const harness = buildHarness();
    const result = await refusal(
      passwordChange(harness, {
        currentPassword: "Wrong1!",
        password: NEW_PASSWORD,
      }),
    );
    expect(result.getStatus()).to.equal(HTTP_BAD_REQUEST);
    expect(result.getBody()).to.equal(INVALID_CURRENT_PASSWORD);
    expect(harness.updates).to.equal(0);
  });

  it("refuses a missing current password", async () => {
    const harness = buildHarness();
    const result = await refusal(
      passwordChange(harness, { password: NEW_PASSWORD }),
    );
    expect(result.getBody()).to.equal(INVALID_CURRENT_PASSWORD);
  });

  it("enforces the sign-up password rules", async () => {
    const harness = buildHarness();
    const result = await refusal(
      passwordChange(harness, {
        currentPassword: CURRENT_PASSWORD,
        password: WEAK_PASSWORD,
      }),
    );
    expect(result.getStatus()).to.equal(HTTP_BAD_REQUEST);
    expect(harness.updates).to.equal(0);
  });

  it("changes the password, stamps the change and keeps other sessions by default", async () => {
    const harness = buildHarness();
    const result = await passwordChange(harness, {
      currentPassword: CURRENT_PASSWORD,
      password: NEW_PASSWORD,
    });
    expect(harness.user.password).to.equal(NEW_PASSWORD);
    expect(harness.user.passwordChangedAt).to.be.instanceOf(Date);
    expect(result.signedOutSessions).to.equal(0);
    expect(harness.sessions).to.have.length(3);
  });

  it("signs out the other sessions on request, never this one", async () => {
    const harness = buildHarness();
    const result = await passwordChange(harness, {
      currentPassword: CURRENT_PASSWORD,
      password: NEW_PASSWORD,
      signOutOtherSessions: true,
    });
    expect(result.signedOutSessions).to.equal(2);
    expect(harness.sessions.map((entry) => entry._id)).to.deep.equal([
      CURRENT_SESSION,
    ]);
  });

  it("lets an account without a password set its first one", async () => {
    const harness = buildHarness(null);
    await passwordChange(harness, { password: NEW_PASSWORD });
    expect(harness.user.password).to.equal(NEW_PASSWORD);
  });
});

describe("[unit] settings/security — email change asks for the current password", () => {
  it("refuses a wrong current password", async () => {
    const harness = buildHarness();
    const result = await refusal(
      changeEmail(
        harness.user,
        { email: FREE_EMAIL, currentPassword: "Wrong1!" },
        harness.userModel,
      ),
    );
    expect(result.getBody()).to.equal(INVALID_CURRENT_PASSWORD);
    expect(harness.user.email).to.equal(OWN_EMAIL);
  });

  it("refuses an address another account holds", async () => {
    const harness = buildHarness();
    const result = await refusal(
      changeEmail(
        harness.user,
        { email: TAKEN_EMAIL, currentPassword: CURRENT_PASSWORD },
        harness.userModel,
      ),
    );
    expect(result.getStatus()).to.equal(HTTP_CONFLICT);
  });

  it("changes the email once the password is proven", async () => {
    const harness = buildHarness();
    const email = await changeEmail(
      harness.user,
      { email: "Camille.Laurent@ACME.dev", currentPassword: CURRENT_PASSWORD },
      harness.userModel,
    );
    expect(email).to.equal(FREE_EMAIL);
    expect(harness.user.email).to.equal(FREE_EMAIL);
  });
});

describe("[unit] settings/security — sessions and backup codes", () => {
  it("lists the current session first, then the most recent", async () => {
    const harness = buildHarness();
    const sessions = await listSessions(harness.user, {
      sessionModel: harness.sessionModel,
      authorization,
    });
    expect(sessions.map((entry) => entry._id)).to.deep.equal([
      CURRENT_SESSION,
      "session-recent",
      "session-old",
    ]);
    expect(sessions[0]?.isCurrent).to.equal(true);
  });

  it("signs out the other sessions only", async () => {
    const harness = buildHarness();
    const result = await revokeOtherSessions(harness.user, {
      sessionModel: harness.sessionModel,
      authorization,
    });
    expect(result.count).to.equal(2);
    expect(harness.sessions).to.have.length(1);
  });

  it("reports the codes left and records that they were saved", async () => {
    const harness = buildHarness();
    harness.user.twoFactorMethods = ["totp"];
    harness.user.twoFactorBackupCodes = ["a", "b", "c"];
    harness.user.twoFactorBackupCodesSavedAt = null;
    expect(getTwoFactorStatus(harness.user)).to.include({
      backupCodesLeft: 3,
      backupCodesTotal: BACKUP_CODE_TOTAL,
      backupCodesSavedAt: null,
    });
    const status = await markBackupCodesSaved(harness.user, harness.userModel);
    expect(status.backupCodesSavedAt).to.be.instanceOf(Date);
  });

  it("refuses to mark codes saved when there are none", async () => {
    const harness = buildHarness();
    const result = await refusal(
      markBackupCodesSaved(harness.user, harness.userModel),
    );
    expect(result.getStatus()).to.equal(HTTP_BAD_REQUEST);
  });
});
