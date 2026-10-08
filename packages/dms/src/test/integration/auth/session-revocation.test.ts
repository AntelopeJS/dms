import { expect } from "chai";
import {
  authorizedClient,
  loginUser,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";

// Signing one device out, from the Security page or by logging out, cuts that
// device off on its next request, not when its access token expires, and
// leaves the account's other devices signed in.

const SESSIONS_URL = "/settings/user/security/sessions";
const LOGOUT_URL = "/api/auth/logout";
const ME_URL = "/api/auth/me";
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface SessionEntry {
  _id: string;
  isCurrent: boolean;
}

async function meStatus(accessToken: string): Promise<number> {
  return (await authorizedClient(accessToken).get(ME_URL)).status;
}

async function currentSessionId(accessToken: string): Promise<string> {
  const response = await authorizedClient(accessToken).get(SESSIONS_URL);
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const current = (response.data as SessionEntry[]).find(
    (entry) => entry.isCurrent,
  );
  if (!current) throw new Error("No current session listed");
  return current._id;
}

describe("[integration] auth/session revocation", () => {
  let user: RegisteredUser;
  let otherDevice: TokenPair;

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser({ owner: true });
    otherDevice = await loginUser(user.email, user.password);
  });

  it("cuts off a session signed out from the Security page", async () => {
    const otherSessionId = await currentSessionId(otherDevice.accessToken);

    const response = await authorizedClient(user.accessToken).delete(
      `${SESSIONS_URL}/${otherSessionId}`,
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);

    expect(await meStatus(otherDevice.accessToken)).to.equal(HTTP_UNAUTHORIZED);
    expect(await meStatus(user.accessToken)).to.equal(HTTP_OK);
  });

  it("cuts off a logged-out session, a copied token included", async () => {
    const response = await authorizedClient(otherDevice.accessToken).post(
      LOGOUT_URL,
      { token: otherDevice.refreshToken },
    );
    expect(response.status, JSON.stringify(response.data)).to.equal(
      HTTP_NO_CONTENT,
    );

    expect(await meStatus(otherDevice.accessToken)).to.equal(HTTP_UNAUTHORIZED);
    expect(await meStatus(user.accessToken)).to.equal(HTTP_OK);
  });
});
