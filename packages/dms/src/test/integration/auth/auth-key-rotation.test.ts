import { GetModel } from "@antelopejs/interface-database-decorators";
import { SessionModel } from "@antelopejs/interface-dms/auth/db";
import type { AxiosInstance } from "axios";
import { assert, expect } from "chai";
import { z } from "zod";
import type {
  PasswordChangeResult,
  SessionHandoff,
  SessionsRevokedResult,
} from "../../../pages/account";
import { validateSessionHandoffToken } from "../../../implementations/dms-auth/services";
import {
  authorizedClient,
  loginUser,
  parseAuthBody,
  type RegisteredUser,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";
import { parseBody } from "../../helpers/parse-body";
import { pageRoutePath } from "@antelopejs/interface-dms/page";

const SECURITY = pageRoutePath("/settings/user/security");
const NEW_PASSWORD = "Rotated26!";
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const PAST_GRACE_MS = 60_000;

const SessionHandoffBody = z.object({
  endpoint: z.string(),
  payload: z.object({ token: z.string() }),
}) satisfies z.ZodType<SessionHandoff>;

const PasswordChangeBody = z.object({
  success: z.literal(true),
  passwordChangedAt: z.coerce.date(),
  signedOutSessions: z.number(),
  sessionHandoff: SessionHandoffBody.optional(),
}) satisfies z.ZodType<PasswordChangeResult>;

const SessionsRevokedBody = z.object({
  success: z.literal(true),
  count: z.number(),
  sessionHandoff: SessionHandoffBody.optional(),
}) satisfies z.ZodType<SessionsRevokedResult>;

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

    assert.isDefined(handoff);
    const redeemed = await redeem(handoff);
    expect(redeemed.status, JSON.stringify(redeemed.data)).to.equal(HTTP_OK);
    const session = parseAuthBody(redeemed);
    expect(session.user?.email).to.equal(user.email);
    expect(await meStatus(session.access_token)).to.equal(HTTP_OK);
    expect(await refreshStatus(session.refresh_token)).to.equal(HTTP_OK);

    const sessions = await authorizedClient(session.access_token).get(
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
    const body = parseBody(PasswordChangeBody, response);
    expect(body.signedOutSessions).to.equal(1);
    await expectRotated(body.sessionHandoff);
  });

  it("rotates on signing out the other sessions and keeps this device signed in", async () => {
    const response = await thisDevice.delete(`${SECURITY}/other-sessions`);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    const body = parseBody(SessionsRevokedBody, response);
    expect(body.count).to.equal(1);
    await expectRotated(body.sessionHandoff);
  });

  it("hands a session back once only", async () => {
    const response = await thisDevice.delete(`${SECURITY}/other-sessions`);
    const { sessionHandoff: handoff } = parseBody(
      SessionsRevokedBody,
      response,
    );
    assert.isDefined(handoff);
    expect((await redeem(handoff)).status).to.equal(HTTP_OK);

    const { sessionId } = await validateSessionHandoffToken(
      handoff.payload.token,
    );
    await GetModel(SessionModel).update(sessionId, {
      refreshTokenRotatedAt: new Date(Date.now() - PAST_GRACE_MS),
    });
    expect((await redeem(handoff)).status).to.equal(HTTP_UNAUTHORIZED);
  });
});
