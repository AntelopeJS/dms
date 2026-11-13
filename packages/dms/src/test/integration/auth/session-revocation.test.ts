import { expect } from "chai";
import {
  authorizedClient,
  loginUser,
  parseAuthBody,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

const SESSIONS_URL = pageRoutePath("/settings/user/security", "/sessions");
const LOGOUT_URL = "/api/auth/logout";
const REFRESH_URL = "/api/auth/refresh";
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
  const response =
    await authorizedClient(accessToken).get<SessionEntry[]>(SESSIONS_URL);
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const current = response.data.find((entry) => entry.isCurrent);
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

  it("refuses the tokens a renewal returned just before the logout", async () => {
    const renewed = parseAuthBody(
      await createClient().post(REFRESH_URL, {
        token: otherDevice.refreshToken,
      }),
    );
    const logout = await authorizedClient(otherDevice.accessToken).post(
      LOGOUT_URL,
      { token: otherDevice.refreshToken },
    );
    expect(logout.status, JSON.stringify(logout.data)).to.equal(
      HTTP_NO_CONTENT,
    );

    const reused = await createClient().post(REFRESH_URL, {
      token: renewed.refresh_token,
    });
    expect(reused.status, JSON.stringify(reused.data)).to.equal(
      HTTP_UNAUTHORIZED,
    );
    expect(await meStatus(renewed.access_token)).to.equal(HTTP_UNAUTHORIZED);
  });
});
