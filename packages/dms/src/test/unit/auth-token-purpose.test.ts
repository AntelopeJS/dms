import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import { sign } from "jsonwebtoken";
import { getAuthConfig } from "../../config";
import {
  generateAccessToken,
  generateRefreshToken,
  generateTenantAssignmentToken,
  generateTwoFactorToken,
  internal,
  validateRefreshToken,
} from "../../implementations/dms-auth";

const TENANT_ID = "purpose-test-tenant";
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

describe("[unit] auth token purpose separation", () => {
  let user: User;

  before(async () => {
    const model = GetModel(UserModel);
    const [id] = await model.insert({
      email: `${randomUUID()}@purpose.test`,
      name: "Purpose test",
      authKey: randomUUID(),
      isValidated: true,
      owner: true,
      language: "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const created = await model.get(id);
    if (!created) throw new Error("Failed to create purpose-test user");
    user = created;
  });

  after(async () => {
    if (user) await GetModel(UserModel).delete(user._id);
  });

  function validateAccess(token: string): Promise<User> {
    return internal.AuthUserValidator(internal.AuthUserAuthenticator(token));
  }

  it("accepts an access token only as access", async () => {
    const { token } = generateAccessToken(TENANT_ID, user);
    expect((await validateAccess(token))._id).to.equal(user._id);
    await expectUnauthorized(() => validateRefreshToken(token));
  });

  it("accepts a refresh token only as refresh", async () => {
    const { token } = generateRefreshToken(TENANT_ID, user);
    expect((await validateRefreshToken(token)).id).to.equal(user._id);
    await expectUnauthorized(() => validateAccess(token));
  });

  it("rejects an MFA challenge as access, raw-user, owner or refresh credentials", async () => {
    const { token } = generateTwoFactorToken(TENANT_ID, user);
    const input = internal.AuthUserAuthenticator(token);
    await expectUnauthorized(() => validateAccess(token));
    await expectUnauthorized(() => internal.AuthRawUserValidator(input));
    await expectUnauthorized(() => internal.AuthOwnerOnlyValidator(input));
    await expectUnauthorized(() => validateRefreshToken(token));
    expect(await internal.IfAuthUserValidator(input)).to.equal(undefined);
  });

  it("rejects a tenant-assignment token as access or refresh credentials", async () => {
    const { token } = generateTenantAssignmentToken(user);
    await expectUnauthorized(() => validateAccess(token));
    await expectUnauthorized(() => validateRefreshToken(token));
  });

  it("rejects old untyped tokens instead of retaining the token-confusion bypass", async () => {
    const secret = `1:${user.authKey}:${getAuthConfig().jwtSecret}`;
    const token = sign({ id: user._id, tenantId: TENANT_ID }, secret);
    await expectUnauthorized(() => validateAccess(token));
    await expectUnauthorized(() => validateRefreshToken(token));
  });

  it("rejects malformed refresh tokens with 401", async () => {
    await expectUnauthorized(() => validateRefreshToken("not-a-jwt"));
  });
});
