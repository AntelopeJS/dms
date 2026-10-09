import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  generateAccessToken,
  internal,
  isRejectedBearerToken,
} from "../../implementations/dms-auth";

// An access token issued for a session dies with that session: deleting the
// row (signing the device out, logging out) refuses the token on the next
// request instead of at its expiry.

const TENANT_ID = "session-revocation-tenant";
const HTTP_UNAUTHORIZED = 401;

async function expectUnauthorized(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(HTTP_UNAUTHORIZED);
    return;
  }
  expect.fail("Expected authentication to reject the token");
}

async function insertUser(): Promise<User> {
  const model = GetModel(UserModel);
  const [id] = await model.insert({
    email: `${randomUUID()}@session-revocation.test`,
    name: "Session revocation test",
    authKey: randomUUID(),
    isValidated: true,
    owner: true,
    language: "en",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const created = await model.get(id);
  if (!created) throw new Error("Failed to create session-revocation user");
  return created;
}

async function insertSession(userId: string): Promise<string> {
  const now = new Date();
  const [id] = await GetModel(SessionModel).insert({
    userId,
    userAgent: "",
    ip: "",
    browser: "Unknown",
    os: "Unknown",
    deviceType: "desktop",
    location: "",
    createdAt: now,
    lastActiveAt: now,
  });
  return id;
}

function validateAccess(token: string): Promise<User> {
  return internal.AuthUserValidator(internal.AuthUserAuthenticator(token));
}

describe("[unit] auth access token bound to its session", () => {
  let user: User;
  let otherUser: User;

  beforeEach(async () => {
    user = await insertUser();
    otherUser = await insertUser();
  });

  afterEach(async () => {
    const sessions = GetModel(SessionModel);
    await sessions.deleteByUserId(user._id);
    await sessions.deleteByUserId(otherUser._id);
    await GetModel(UserModel).delete(user._id);
    await GetModel(UserModel).delete(otherUser._id);
  });

  it("accepts the token while its session exists", async () => {
    const sessionId = await insertSession(user._id);
    const { token } = generateAccessToken(TENANT_ID, user, sessionId);
    expect((await validateAccess(token))._id).to.equal(user._id);
    expect(await isRejectedBearerToken(`Bearer ${token}`)).to.equal(false);
  });

  it("refuses the token once its session is deleted", async () => {
    const sessionId = await insertSession(user._id);
    const { token } = generateAccessToken(TENANT_ID, user, sessionId);
    await GetModel(SessionModel).delete(sessionId);

    await expectUnauthorized(() => validateAccess(token));
    await expectUnauthorized(() =>
      internal.AuthRawUserValidator(internal.AuthUserAuthenticator(token)),
    );
    expect(
      await internal.IfAuthUserValidator(
        internal.IfAuthUserAuthenticator(token),
      ),
    ).to.equal(undefined);
    expect(await isRejectedBearerToken(`Bearer ${token}`)).to.equal(true);
  });

  it("keeps the user's other sessions working when one is deleted", async () => {
    const revokedId = await insertSession(user._id);
    const keptId = await insertSession(user._id);
    const revoked = generateAccessToken(TENANT_ID, user, revokedId).token;
    const kept = generateAccessToken(TENANT_ID, user, keptId).token;
    await GetModel(SessionModel).delete(revokedId);

    await expectUnauthorized(() => validateAccess(revoked));
    expect((await validateAccess(kept))._id).to.equal(user._id);
  });

  it("refuses a token naming another user's session", async () => {
    const foreignSessionId = await insertSession(otherUser._id);
    const { token } = generateAccessToken(TENANT_ID, user, foreignSessionId);
    await expectUnauthorized(() => validateAccess(token));
  });

  it("leaves a token without a session claim to its signature", async () => {
    const { token } = generateAccessToken(TENANT_ID, user);
    expect((await validateAccess(token))._id).to.equal(user._id);
  });
});
