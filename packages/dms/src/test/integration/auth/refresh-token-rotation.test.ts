import { GetModel } from "@antelopejs/interface-database-decorators";
import { validateRefreshToken } from "@antelopejs/interface-dms/auth";
import { SessionModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import {
  authorizedClient,
  loginUser,
  parseAuthBody,
  registerUser,
} from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { createClient } from "../../helpers/http";

const REFRESH_URL = "/api/auth/refresh";
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const PAST_GRACE_MS = 60_000;
const CONCURRENT_REFRESHES = 3;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function refresh(token: string) {
  return createClient().post(REFRESH_URL, { token });
}

async function renew(token: string): Promise<TokenPair> {
  const response = await refresh(token);
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  const body = parseAuthBody(response);
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

/** Moves the session's last rotation out of the grace window. */
async function endGrace(refreshToken: string): Promise<void> {
  const { sessionId } = await validateRefreshToken(refreshToken);
  if (!sessionId) throw new Error("The refresh token names no session");
  await GetModel(SessionModel).update(sessionId, {
    refreshTokenRotatedAt: new Date(Date.now() - PAST_GRACE_MS),
  });
}

describe("[integration] auth/refresh token rotation", () => {
  let login: TokenPair;

  beforeEach(async () => {
    await resetDatabase();
    const user = await registerUser({ owner: true });
    login = await loginUser(user.email, user.password);
  });

  it("rotates on every refresh and refuses the replayed token", async () => {
    const renewed = await renew(login.refreshToken);
    expect(renewed.refreshToken).to.not.equal(login.refreshToken);

    await endGrace(renewed.refreshToken);

    expect((await refresh(login.refreshToken)).status).to.equal(
      HTTP_UNAUTHORIZED,
    );
  });

  it("revokes the session when a rotated token comes back after the grace", async () => {
    const renewed = await renew(login.refreshToken);
    await endGrace(renewed.refreshToken);

    await refresh(login.refreshToken);

    expect((await refresh(renewed.refreshToken)).status).to.equal(
      HTTP_UNAUTHORIZED,
    );
    expect(
      (await authorizedClient(renewed.accessToken).get("/api/auth/me")).status,
    ).to.equal(HTTP_UNAUTHORIZED);
  });

  it("deletes the session when the original token comes back after an attacker refreshed twice", async () => {
    const stolen = await renew(login.refreshToken);
    const attacker = await renew(stolen.refreshToken);

    expect((await refresh(login.refreshToken)).status).to.equal(
      HTTP_UNAUTHORIZED,
    );

    expect((await refresh(attacker.refreshToken)).status).to.equal(
      HTTP_UNAUTHORIZED,
    );
    expect(
      (await authorizedClient(attacker.accessToken).get("/api/auth/me")).status,
    ).to.equal(HTTP_UNAUTHORIZED);
  });

  it("gives the refreshes racing inside the grace the same successor", async () => {
    const racing = await Promise.all(
      Array.from({ length: CONCURRENT_REFRESHES }, () =>
        renew(login.refreshToken),
      ),
    );
    const successors = new Set(racing.map((pair) => pair.refreshToken));

    expect(successors.size).to.equal(1);
    const successor = racing[0].refreshToken;
    expect(successor).to.not.equal(login.refreshToken);
    await renew(successor);
  });
});
