import { expect } from "chai";
import { authorizedClient, loginUser, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

const SESSIONS_URL = "/settings/user/profile/sessions";
const LOGOUT_URL = "/api/auth/logout";
const UNAUTH_STATUS = 401;
const SUCCESS_STATUS = 200;
const NO_CONTENT_STATUS = 204;

// SKIPPED: depends on seeding state in-process (helpers/fixtures) that the
// route handlers cannot see. Under `ajs module test`, mocha-loaded test code and
// the runtime-loaded module get separate interface-database instances, so an
// invite seeded via GetModel is invisible to the signup route. See TESTING.md.
describe.skip("[integration] auth/sessions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lists the current session after login", async () => {
    const user = await registerUser({ owner: true });
    const session = await loginUser(user.email, user.password);

    const client = authorizedClient(session.accessToken);
    const response = await client.get(SESSIONS_URL);

    expect(response.status).to.equal(SUCCESS_STATUS);
    expect(response.data).to.be.an("array");
    expect(response.data.length).to.be.at.least(1);
    const current = response.data.find(
      (entry: { isCurrent: boolean }) => entry.isCurrent,
    );
    expect(current).to.exist;
  });

  it("logout deletes the current session from the sessions list", async () => {
    const user = await registerUser({ owner: true });
    const session = await loginUser(user.email, user.password);

    const client = authorizedClient(session.accessToken);
    const beforeLogout = await client.get(SESSIONS_URL);
    expect(beforeLogout.status).to.equal(SUCCESS_STATUS);
    const initialCount = beforeLogout.data.length;
    const currentBefore = beforeLogout.data.find(
      (entry: { isCurrent: boolean }) => entry.isCurrent,
    );
    expect(currentBefore).to.exist;

    const logoutResponse = await client.post(LOGOUT_URL, {
      token: session.refreshToken,
    });
    expect(logoutResponse.status).to.equal(NO_CONTENT_STATUS);

    const fallbackClient = authorizedClient(user.accessToken);
    const afterLogout = await fallbackClient.get(SESSIONS_URL);
    expect(afterLogout.status).to.equal(SUCCESS_STATUS);
    expect(afterLogout.data.length).to.equal(initialCount - 1);
    const revokedStillPresent = afterLogout.data.some(
      (entry: { _id: string }) => entry._id === currentBefore._id,
    );
    expect(revokedStillPresent).to.equal(false);
  });

  it("rejects unauthenticated GET /sessions with 401", async () => {
    const client = createClient();
    const response = await client.get(SESSIONS_URL);

    expect(response.status).to.equal(UNAUTH_STATUS);
  });

  it("rejects unauthenticated DELETE /sessions with 401", async () => {
    const client = createClient();
    const response = await client.delete(SESSIONS_URL);

    expect(response.status).to.equal(UNAUTH_STATUS);
  });
});
