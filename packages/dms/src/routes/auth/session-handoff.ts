import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  generateAccessToken,
  generateRefreshToken,
  sanitizeUser,
} from "@antelopejs/interface-dms/auth";
import type { SessionModel } from "@antelopejs/interface-dms/auth/db";
import { validateSessionHandoffToken } from "../../implementations/dms-auth/services";
import { authSchema } from "../../validation";
import type { AuthResponse } from "./types";

const HTTP_UNAUTHORIZED = 401;

/**
 * Trades a session handoff token for a fresh token pair of its session. The
 * handoff sits in the session's refresh slot, so the trade rotates it out and
 * the same token buys nothing twice.
 *
 * @param sessionModel Sessions model
 * @param body `{ token }`
 * @returns The session's new token pair
 */
export async function redeemSessionHandoff(
  sessionModel: SessionModel,
  body: Parameters<typeof authSchema.sessionHandoff.parse>[0],
): Promise<AuthResponse> {
  const { token } = assertValidation(body, (value) =>
    authSchema.sessionHandoff.parse(value),
  );
  const { user, tenantId, sessionId } =
    await validateSessionHandoffToken(token);
  const refreshTokenData = await generateRefreshToken(
    tenantId,
    user,
    sessionId,
  );
  const refreshToken = await sessionModel.rotateRefreshToken(
    sessionId,
    token,
    refreshTokenData.token,
  );
  assert(refreshToken, HTTP_UNAUTHORIZED, "error.session_expired");
  const accessTokenData = await generateAccessToken(tenantId, user, sessionId);
  return {
    token_type: "Bearer",
    access_token: accessTokenData.token,
    expires_in: accessTokenData.expiresIn,
    refresh_token: refreshToken,
    user: await sanitizeUser(user),
  };
}
