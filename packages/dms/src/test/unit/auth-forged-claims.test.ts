import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { assert, expect } from "chai";
import { type JwtPayload, sign } from "jsonwebtoken";
import {
  internal,
  validateRefreshToken,
  validateTenantAssignmentToken,
  validateTwoFactorToken,
} from "../../implementations/dms-auth";
import {
  generateSecret,
  validateSessionHandoffToken,
} from "../../implementations/dms-auth/services";

const TENANT_ID = "forged-claims-tenant";
const HTTP_UNAUTHORIZED = 401;
const UNKNOWN_USER_ID = "no-such-user";

interface Refusal {
  status: number;
  body: unknown;
}

async function refusalOf<T>(run: () => Promise<T>): Promise<Refusal> {
  try {
    await run();
  } catch (error) {
    assert.instanceOf(error, HTTPResult);
    return { status: error.getStatus(), body: error.getBody() };
  }
  return expect.fail("Expected authentication to reject the token");
}

const MALFORMED_PAYLOAD_TOKEN = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from("not json{").toString("base64url"),
  Buffer.from("signature").toString("base64url"),
].join(".");

const EXPIRED = { exp: Math.floor(Date.now() / 1000) - 60 };

function forge(claims: JwtPayload): string {
  return sign({ tenantId: TENANT_ID, ...claims }, "forged-secret");
}

function signFor(user: User, claims: JwtPayload): string {
  return sign(
    { id: user._id, tenantId: TENANT_ID, ...claims },
    generateSecret(user.authKey),
  );
}

describe("[unit] auth forged claims", () => {
  let user: User;

  before(async () => {
    const model = GetModel(UserModel);
    const [id] = await model.insert({
      email: `${randomUUID()}@forged-claims.test`,
      name: "Forged claims test",
      authKey: randomUUID(),
      isValidated: true,
      owner: true,
      language: "en",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const created = await model.get(id);
    if (!created) throw new Error("Failed to create forged-claims user");
    user = created;
  });

  after(async () => {
    if (user) await GetModel(UserModel).delete(user._id);
  });

  it("answers every access token it refuses before trusting its claims the same 401", async () => {
    const refused = [
      "not-a-jwt",
      MALFORMED_PAYLOAD_TOKEN,
      forge({ id: { $gt: "" }, purpose: "access" }),
      forge({ id: { $gt: "zzzzzzzz" }, purpose: "access" }),
      forge({ id: UNKNOWN_USER_ID, sessionId: { $gt: "" }, purpose: "access" }),
      forge({ id: user._id, purpose: "access" }),
      forge({ id: UNKNOWN_USER_ID, purpose: "access" }),
      signFor(user, { purpose: "access", ...EXPIRED }),
      signFor(user, { purpose: "refresh" }),
    ];
    const refusals = await Promise.all(
      refused.map((token) =>
        refusalOf(async () =>
          internal.AuthUserValidator(internal.AuthUserAuthenticator(token)),
        ),
      ),
    );
    expect(refusals[0].status).to.equal(HTTP_UNAUTHORIZED);
    for (const refusal of refusals) {
      expect(refusal).to.deep.equal(refusals[0]);
    }
  });

  it("refuses a malformed two-factor, tenant-assignment or session-handoff token with its 401", async () => {
    const [twoFactor, assignment, handoff] = await Promise.all([
      refusalOf(() => validateTwoFactorToken(MALFORMED_PAYLOAD_TOKEN)),
      refusalOf(() => validateTenantAssignmentToken(MALFORMED_PAYLOAD_TOKEN)),
      refusalOf(() => validateSessionHandoffToken(MALFORMED_PAYLOAD_TOKEN)),
    ]);
    expect(twoFactor).to.deep.equal({
      status: HTTP_UNAUTHORIZED,
      body: "error.invalid_2fa_token",
    });
    expect(assignment.status).to.equal(HTTP_UNAUTHORIZED);
    expect(handoff).to.deep.equal({
      status: HTTP_UNAUTHORIZED,
      body: "error.invalid_token",
    });
  });

  it("reads a malformed bearer token on an IfAuthUser route as anonymous", () => {
    expect(internal.IfAuthUserAuthenticator(MALFORMED_PAYLOAD_TOKEN)).to.equal(
      undefined,
    );
  });

  it("answers every refresh token it refuses before trusting its claims the same 401", async () => {
    const refused = [
      "not-a-jwt",
      MALFORMED_PAYLOAD_TOKEN,
      forge({ id: user._id, purpose: "refresh" }),
      forge({ id: UNKNOWN_USER_ID, purpose: "refresh" }),
      signFor(user, { purpose: "refresh", ...EXPIRED }),
      signFor(user, { purpose: "access" }),
    ];
    const refusals = await Promise.all(
      refused.map((token) => refusalOf(() => validateRefreshToken(token))),
    );
    expect(refusals[0].status).to.equal(HTTP_UNAUTHORIZED);
    for (const refusal of refusals) {
      expect(refusal).to.deep.equal(refusals[0]);
    }
  });
});
