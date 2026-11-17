import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import {
  type Session,
  SessionModel,
  type User,
} from "@antelopejs/interface-dms/auth/db";
import { sign } from "jsonwebtoken";
import type { z } from "zod";
import {
  changePassword,
  listSessions,
  revokeOtherSessions,
  requestEmailChange,
  getTwoFactorStatus,
  markBackupCodesSaved,
} from "../../../../pages/account";
import { sessionFixture } from "../../../helpers/table-fixtures";
import { isString } from "@antelopejs/interface-dms/utils/internal/type-check";
import { RecordingUserModel } from "../../../helpers/recording-user-model";
import {
  plainPasswordUserFixture,
  storedUserFixture,
} from "../../../helpers/user-fixture";
import { securitySchema } from "../../../../validation";

const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;
const CURRENT_PASSWORD = "Current1!";
const NEW_PASSWORD = "Antelope26!";
const USER_ID = "account-security-user";
const OTHER_USER_ID = "account-security-other";
const OWN_EMAIL = "camille@acme.dev";
const TAKEN_EMAIL = "taken@acme.dev";
const FREE_EMAIL = "camille.laurent@acme.dev";
const CURRENT_SESSION = "session-current";
const TENANT_ID = "account-security-tenant";
const ORIGINAL_AUTH_KEY = "original-auth-key";
const TOKEN_SIGNING_KEY = "account-security-test";
const BACKUP_CODE_TOTAL = 10;
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";

/** Finds the account under test, and no other but the one holding TAKEN_EMAIL. */
class HeldUserModel extends RecordingUserModel {
  constructor(private readonly user: User) {
    super();
  }

  override async get(): Promise<User> {
    return this.user;
  }

  override async getByEmail(email: string): Promise<User | undefined> {
    return email === TAKEN_EMAIL
      ? storedUserFixture({ _id: OTHER_USER_ID, email: TAKEN_EMAIL })
      : undefined;
  }
}

/** Holds the user's sessions in memory and notes the refresh tokens written. */
class HeldSessionModel extends SessionModel {
  /** Refresh tokens written per session id. */
  readonly refreshTokens = new Map<string, string>();

  constructor(public sessions: Session[]) {
    super(GetModel(SessionModel).database);
  }

  override async getByUserId(): Promise<Session[]> {
    return [...this.sessions];
  }

  override async delete(id: string): Promise<number> {
    this.sessions = this.sessions.filter((entry) => entry._id !== id);
    return 1;
  }

  override async replaceRefreshToken(id: string, token: string): Promise<void> {
    this.refreshTokens.set(id, token);
  }
}

interface Harness {
  user: User;
  userModel: HeldUserModel;
  sessionModel: HeldSessionModel;
}

function buildUser(password: string | null): User {
  const user = plainPasswordUserFixture({
    _id: USER_ID,
    email: OWN_EMAIL,
    password,
    authKey: ORIGINAL_AUTH_KEY,
    createdAt: new Date(0),
    twoFactorMethods: [],
    twoFactorBackupCodes: [],
    testHashAsync: async <This extends {}, F extends keyof This>(
      _field: F,
      candidate: This[F],
    ) => candidate === CURRENT_PASSWORD,
    setHashAsync: async <This extends object, F extends keyof This>(
      _field: F,
      value: This[F],
    ): Promise<void> => {
      if (isString(value)) user.password = value;
    },
  });
  return user;
}

function session(id: string, lastActiveAt: number): Session {
  return sessionFixture({
    _id: id,
    userId: USER_ID,
    browser: "Chrome",
    os: "macOS",
    ip: "127.0.0.1",
    deviceType: "desktop",
    location: "",
    createdAt: new Date(0),
    lastActiveAt: new Date(lastActiveAt),
  });
}

function buildHarness(password: string | null = "hashed"): Harness {
  const user = buildUser(password);
  return {
    user,
    userModel: new HeldUserModel(user),
    sessionModel: new HeldSessionModel([
      session("session-old", 1),
      session(CURRENT_SESSION, 2),
      session("session-recent", 3),
    ]),
  };
}

const authorization = `Bearer ${sign({ sessionId: CURRENT_SESSION, tenantId: TENANT_ID }, TOKEN_SIGNING_KEY)}`;

async function refusal(action: Promise<unknown>): Promise<HTTPResult> {
  const outcome = await action.then(
    () => undefined,
    (error: unknown) => error,
  );
  if (outcome instanceof HTTPResult) return outcome;
  throw new Error(`Expected an HTTP refusal, got ${String(outcome)}`);
}

function passwordChange(
  harness: Harness,
  body: z.input<typeof securitySchema.changePassword>,
) {
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
    expect(harness.userModel.updateCalls).to.equal(0);
  });

  it("refuses a missing current password", async () => {
    const harness = buildHarness();
    const result = await refusal(
      passwordChange(harness, { password: NEW_PASSWORD }),
    );
    expect(result.getBody()).to.equal(INVALID_CURRENT_PASSWORD);
  });

  it("changes the password and stamps the change, with the new auth key in one write", async () => {
    const harness = buildHarness();
    await passwordChange(harness, {
      currentPassword: CURRENT_PASSWORD,
      password: NEW_PASSWORD,
    });
    expect(harness.user.password).to.equal(NEW_PASSWORD);
    expect(harness.user.passwordChangedAt).to.be.instanceOf(Date);
    expect(harness.user.authKey).to.not.equal(ORIGINAL_AUTH_KEY);
    expect(harness.userModel.updateCalls).to.equal(1);
  });

  it("signs out every other session and hands this one back a way in", async () => {
    const harness = buildHarness();
    const result = await passwordChange(harness, {
      currentPassword: CURRENT_PASSWORD,
      password: NEW_PASSWORD,
    });
    expect(result.signedOutSessions).to.equal(2);
    expect(
      harness.sessionModel.sessions.map((entry) => entry._id),
    ).to.deep.equal([CURRENT_SESSION]);
    expect(result.sessionHandoff?.endpoint).to.equal(
      "/api/auth/session-handoff",
    );
    expect(harness.sessionModel.refreshTokens.get(CURRENT_SESSION)).to.equal(
      result.sessionHandoff?.payload.token,
    );
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
      requestEmailChange(
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
      requestEmailChange(
        harness.user,
        { email: TAKEN_EMAIL, currentPassword: CURRENT_PASSWORD },
        harness.userModel,
      ),
    );
    expect(result.getStatus()).to.equal(HTTP_CONFLICT);
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
      userModel: harness.userModel,
      sessionModel: harness.sessionModel,
      authorization,
    });
    expect(result.count).to.equal(2);
    expect(harness.sessionModel.sessions).to.have.length(1);
    expect(harness.user.authKey).to.not.equal(ORIGINAL_AUTH_KEY);
    expect(result.sessionHandoff?.payload.token).to.be.a("string");
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
