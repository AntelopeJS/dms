import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { assert, expect } from "chai";
import { type JwtPayload, sign } from "jsonwebtoken";
import { internal, validateRefreshToken } from "../../implementations/dms-auth";

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

function forge(claims: JwtPayload): string {
  return sign({ tenantId: TENANT_ID, ...claims }, "forged-secret");
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

  it("answers every forged access token the same 401, whether its id names a user or not", async () => {
    const forged = [
      "not-a-jwt",
      forge({ id: { $gt: "" }, purpose: "access" }),
      forge({ id: { $gt: "zzzzzzzz" }, purpose: "access" }),
      forge({ id: UNKNOWN_USER_ID, sessionId: { $gt: "" }, purpose: "access" }),
      forge({ id: user._id, purpose: "access" }),
      forge({ id: UNKNOWN_USER_ID, purpose: "access" }),
    ];
    const refusals = await Promise.all(
      forged.map((token) =>
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

  it("answers a forged refresh token the same 401 whether its id names a user or not", async () => {
    const [known, unknown] = await Promise.all(
      [user._id, UNKNOWN_USER_ID].map((id) =>
        refusalOf(() =>
          validateRefreshToken(forge({ id, purpose: "refresh" })),
        ),
      ),
    );
    expect(known.status).to.equal(HTTP_UNAUTHORIZED);
    expect(known).to.deep.equal(unknown);
  });
});
