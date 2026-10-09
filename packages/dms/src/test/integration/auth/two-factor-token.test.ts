import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import { decode, type JwtPayload, sign } from "jsonwebtoken";
import { generateTwoFactorToken } from "../../../implementations/dms-auth";
import { generateSecret } from "../../../implementations/dms-auth/token-secret";
import { registerUser, type RegisteredUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

// The token of the two-factor step is refused with one answer whatever is
// wrong with it, so the answer tells neither which user ids exist nor what
// the token library found; a request without one names what is missing.

const TWO_FACTOR_ROUTES = [
  "/api/auth/verify-2fa",
  "/api/auth/request-2fa-email",
];
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const INVALID_TWO_FACTOR_TOKEN = "error.invalid_2fa_token";
const TWO_FACTOR_PURPOSE = "2fa";
const UNKNOWN_USER_ID = "no-such-user";
const FOREIGN_SECRET = "not-the-instance-secret";
const SECONDS_PER_MINUTE = 60;
const TOTP_CODE = "123456";

function post(route: string, body: Record<string, unknown>) {
  return createClient().post(route, body);
}

function attempt(route: string, token: string) {
  return post(route, { token, code: TOTP_CODE, method: "totp" });
}

async function userSecret(userId: string): Promise<string> {
  const stored = await GetModel(UserModel).get(userId);
  if (!stored) throw new Error(`No user ${userId}`);
  return generateSecret(stored.authKey);
}

function tenantOf(user: RegisteredUser): string {
  return (decode(user.accessToken) as JwtPayload).tenantId as string;
}

/** One token for each way a two-factor token can be wrong. */
async function badTokens(
  user: RegisteredUser,
): Promise<Record<string, string>> {
  const tenantId = tenantOf(user);
  const claims = { id: user.userId, tenantId, purpose: TWO_FACTOR_PURPOSE };
  const secret = await userSecret(user.userId);
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    "an unknown user": sign({ ...claims, id: UNKNOWN_USER_ID }, FOREIGN_SECRET),
    "a bad signature": sign(claims, FOREIGN_SECRET),
    "an expired challenge": sign(
      { ...claims, exp: nowSeconds - SECONDS_PER_MINUTE },
      secret,
    ),
    "another purpose": sign({ ...claims, purpose: "refresh" }, secret),
  };
}

describe("[integration] auth/two-factor token", () => {
  let user: RegisteredUser;

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser({ owner: true });
  });

  for (const route of TWO_FACTOR_ROUTES) {
    it(`refuses a token that is no JWT with a 401 on ${route}`, async () => {
      const response = await attempt(route, "abc");
      expect(response.status, JSON.stringify(response.data)).to.equal(
        HTTP_UNAUTHORIZED,
      );
      expect(response.data).to.equal(INVALID_TWO_FACTOR_TOKEN);
    });

    it(`answers every bad token alike on ${route}`, async () => {
      for (const [problem, token] of Object.entries(await badTokens(user))) {
        const response = await attempt(route, token);
        expect(response.status, problem).to.equal(HTTP_UNAUTHORIZED);
        expect(response.data, problem).to.equal(INVALID_TWO_FACTOR_TOKEN);
      }
    });

    it(`names the missing token on ${route}`, async () => {
      for (const body of [{}, { token: "" }]) {
        const response = await post(route, {
          ...body,
          code: TOTP_CODE,
          method: "totp",
        });
        expect(response.status, JSON.stringify(body)).to.equal(
          HTTP_BAD_REQUEST,
        );
        expect(response.data).to.equal(INVALID_TWO_FACTOR_TOKEN);
      }
    });
  }

  it("still takes a genuine token past the token check", async () => {
    const stored = await GetModel(UserModel).get(user.userId);
    if (!stored) throw new Error(`No user ${user.userId}`);
    const { token } = generateTwoFactorToken(tenantOf(user), stored);
    const response = await post("/api/auth/request-2fa-email", { token });
    expect(response.status, JSON.stringify(response.data)).to.equal(
      HTTP_BAD_REQUEST,
    );
    expect(response.data).to.equal("error.2fa_email_not_enabled");
  });
});
