import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel } from "@antelopejs/interface-dms/auth/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { decode } from "jsonwebtoken";
import {
  authorizedClient,
  loginUser,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

// A password change and "Sign out other sessions" rotate the account's auth
// key: every token issued so far stops working, the other sessions go, and
// the caller's own session gets a handoff that buys it a new pair once.

const SECURITY = "/settings/user/security";
const NEW_PASSWORD = "Rotated26!";
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const PAST_GRACE_MS = 60_000;

interface HandoffPayload {
  token: string;
}

interface SessionHandoff {
  endpoint: string;
  payload: HandoffPayload;
}

interface HandoffClaims {
  sessionId: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

async function meStatus(accessToken: string): Promise<number> {
  return (await authorizedClient(accessToken).get("/api/auth/me")).status;
}

async function refreshStatus(refreshToken: string): Promise<number> {
  const response = await createClient().post("/api/auth/refresh", {
    token: refreshToken,
  });
  return response.status;
}

async function redeem(handoff: SessionHandoff) {
  return createClient().post(handoff.endpoint, handoff.payload);
}

describe("[integration] auth/auth key rotation", () => {
  let user: RegisteredUser;
  let thisDevice: AxiosInstance;
  let otherDevice: TokenPair;

  beforeEach(async () => {
    await resetDatabase();
    user = await registerUser({ owner: true });
    thisDevice = authorizedClient(user.accessToken);
    otherDevice = await loginUser(user.email, user.password);
  });

  const expectRotated = async (handoff: SessionHandoff | undefined) => {
    expect(handoff?.endpoint).to.equal("/api/auth/session-handoff");
    expect(await meStatus(otherDevice.accessToken)).to.equal(HTTP_UNAUTHORIZED);
    expect(await refreshStatus(otherDevice.refreshToken)).to.equal(
      HTTP_UNAUTHORIZED,
    );
    expect(await meStatus(user.accessToken)).to.equal(HTTP_UNAUTHORIZED);

    const redeemed = await redeem(handoff as SessionHandoff);
    expect(redeemed.status, JSON.stringify(redeemed.data)).to.equal(HTTP_OK);
    expect(redeemed.data.user?.email).to.equal(user.email);
    expect(await meStatus(redeemed.data.access_token)).to.equal(HTTP_OK);
    expect(await refreshStatus(redeemed.data.refresh_token)).to.equal(HTTP_OK);

    const sessions = await authorizedClient(redeemed.data.access_token).get(
      `${SECURITY}/sessions`,
    );
    expect(sessions.data).to.have.length(1);
    expect(sessions.data[0].isCurrent).to.equal(true);
  };

  it("rotates on a password change and keeps this device signed in", async () => {
    const response = await thisDevice.post(`${SECURITY}/password`, {
      currentPassword: user.password,
      password: NEW_PASSWORD,
    });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(response.data.signedOutSessions).to.equal(1);
    await expectRotated(response.data.sessionHandoff);
  });

  it("rotates on signing out the other sessions and keeps this device signed in", async () => {
    const response = await thisDevice.delete(`${SECURITY}/other-sessions`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    expect(response.data.count).to.equal(1);
    await expectRotated(response.data.sessionHandoff);
  });

  it("hands a session back once only", async () => {
    const response = await thisDevice.delete(`${SECURITY}/other-sessions`);
    const handoff = response.data.sessionHandoff as SessionHandoff;
    expect((await redeem(handoff)).status).to.equal(HTTP_OK);
    // A duplicate racing the first trade gets the same pair back for a few
    // seconds (the refresh rotation's predecessor grace); past it, nothing.
    const { sessionId } = decode(handoff.payload.token) as HandoffClaims;
    await GetModel(SessionModel).update(sessionId, {
      refreshTokenRotatedAt: new Date(Date.now() - PAST_GRACE_MS),
    });
    expect((await redeem(handoff)).status).to.equal(HTTP_UNAUTHORIZED);
  });
});
