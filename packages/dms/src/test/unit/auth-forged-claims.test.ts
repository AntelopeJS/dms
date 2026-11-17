import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  internal,
  validateRefreshToken,
  validateTenantAssignmentToken,
  validateTwoFactorToken,
} from "../../implementations/dms-auth";
import { validateSessionHandoffToken } from "../../implementations/dms-auth/services";
import {
  EXPIRED,
  forge,
  HTTP_UNAUTHORIZED,
  insertTokenUser,
  MALFORMED_PAYLOAD_TOKEN,
  refusalOf,
  signFor,
  UNKNOWN_USER_ID,
} from "../helpers/forged-tokens";

const SESSION_ID = "signed-session";

describe("[unit] auth forged claims", () => {
  let user: User;

  before(async () => {
    user = await insertTokenUser();
  });

  after(async () => {
    if (user) await GetModel(UserModel).delete(user._id);
  });

  it("answers every access token it refuses before trusting its claims the same 401", async () => {
    const refused = [
      "not-a-jwt",
      MALFORMED_PAYLOAD_TOKEN,
      forge({ id: { $gt: "" }, sessionId: SESSION_ID, purpose: "access" }),
      forge({
        id: { $gt: "zzzzzzzz" },
        sessionId: SESSION_ID,
        purpose: "access",
      }),
      forge({ id: UNKNOWN_USER_ID, sessionId: { $gt: "" }, purpose: "access" }),
      forge({ id: user._id, sessionId: SESSION_ID, purpose: "access" }),
      forge({ id: UNKNOWN_USER_ID, sessionId: SESSION_ID, purpose: "access" }),
      signFor(user, { sessionId: SESSION_ID, purpose: "access", ...EXPIRED }),
      signFor(user, { sessionId: SESSION_ID, purpose: "refresh" }),
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
      forge({ id: user._id, sessionId: SESSION_ID, purpose: "refresh" }),
      forge({ id: UNKNOWN_USER_ID, sessionId: SESSION_ID, purpose: "refresh" }),
      signFor(user, { sessionId: SESSION_ID, purpose: "refresh", ...EXPIRED }),
      signFor(user, { sessionId: SESSION_ID, purpose: "access" }),
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
