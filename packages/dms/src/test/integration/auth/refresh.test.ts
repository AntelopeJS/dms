import { expect } from "chai";
import { sign } from "jsonwebtoken";
import { authorizedClient, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

const REFRESH_URL = "/api/auth/refresh";
const LOGOUT_URL = "/api/auth/logout";
const SUCCESS_STATUS = 200;
const UNAUTH_STATUS = 401;
const NO_CONTENT_STATUS = 204;
const BEARER = "Bearer";
const FAKE_USER_ID = "000000000000000000000000";
const FAKE_NAMESPACE = "default";
const FAKE_SECRET = "fake-secret";
const EXPIRED_EXPIRES_IN = -1;

function buildExpiredToken(): string {
  return sign({ id: FAKE_USER_ID, namespace: FAKE_NAMESPACE }, FAKE_SECRET, {
    expiresIn: EXPIRED_EXPIRES_IN,
  });
}

// SKIPPED: depends on seeding state in-process (helpers/fixtures) that the
// route handlers cannot see. Under `ajs module test`, mocha-loaded test code and
// the runtime-loaded module get separate interface-database instances, so an
// invite seeded via GetModel is invisible to the signup route. See TESTING.md.
describe.skip("[integration] auth/refresh", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("returns a new access token from a valid refresh token", async () => {
    const user = await registerUser();

    const client = createClient();
    const response = await client.post(REFRESH_URL, {
      token: user.refreshToken,
    });

    expect(response.status).to.equal(SUCCESS_STATUS);
    expect(response.data.token_type).to.equal(BEARER);
    expect(response.data.access_token).to.be.a("string").and.not.empty;
    expect(response.data.refresh_token).to.be.a("string").and.not.empty;
  });

  it("rejects an expired refresh token referencing an unknown user with 401", async () => {
    const client = createClient();
    const response = await client.post(REFRESH_URL, {
      token: buildExpiredToken(),
    });

    expect(response.status).to.equal(UNAUTH_STATUS);
  });

  it("rejects a refresh token whose session has been revoked with 401", async () => {
    const user = await registerUser();

    const authClient = authorizedClient(user.accessToken);
    const logoutResponse = await authClient.post(LOGOUT_URL, {
      token: user.refreshToken,
    });
    expect(logoutResponse.status).to.equal(NO_CONTENT_STATUS);

    const client = createClient();
    const response = await client.post(REFRESH_URL, {
      token: user.refreshToken,
    });

    expect(response.status).to.equal(UNAUTH_STATUS);
  });
});
