import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  generateAccessToken,
  generateRefreshToken,
  validateRefreshToken,
} from "@antelopejs/interface-dms/auth";
import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { decode } from "jsonwebtoken";
import { authSchema } from "../../validation/auth.schema";
import { REFRESH_TOKEN_ROTATION_THRESHOLD_MS } from "./constants";
import type { AuthResponse } from "./types";

export const HTTP_FORBIDDEN = 403;

function shouldRotateRefreshToken(token: string): boolean {
  const payload = decode(token) as { iat?: number } | null;
  if (!payload?.iat) return false;
  const tokenAgeMs = Date.now() - payload.iat * 1000;
  return tokenAgeMs > REFRESH_TOKEN_ROTATION_THRESHOLD_MS;
}

interface TenantAccessUser {
  _id: string;
  owner?: boolean;
}

async function assertTenantAccess(
  user: TenantAccessUser,
  tenantId: string,
): Promise<void> {
  if (user.owner) return;
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const membership = await memberModel.getByUser(user._id);
  assert(membership, HTTP_FORBIDDEN, "error.not_a_member");
}

export async function refresh(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: unknown,
): Promise<AuthResponse> {
  const { token } = assertValidation(body, (v) => authSchema.refresh.parse(v));

  const tokenPayload = await validateRefreshToken(token);

  const user = await userModel.get(tokenPayload.id);
  assert(user, 401, "error.invalid_token");

  if (tokenPayload.sessionId) {
    const session = await sessionModel.get(tokenPayload.sessionId);
    assert(session, 401, "error.session_expired");
  }

  const { tenantId } = tokenPayload;
  assert(tenantId, 401, "error.invalid_token");
  await assertTenantAccess(user, tenantId);

  const accessTokenData = await generateAccessToken(
    tenantId,
    user,
    tokenPayload.sessionId,
  );

  let refreshToken = token;
  if (tokenPayload.sessionId && shouldRotateRefreshToken(token)) {
    const refreshTokenData = await generateRefreshToken(
      tenantId,
      user,
      tokenPayload.sessionId,
    );
    const resolvedToken = await sessionModel.rotateRefreshToken(
      tokenPayload.sessionId,
      token,
      refreshTokenData.token,
    );
    assert(resolvedToken, 401, "error.session_expired");
    refreshToken = resolvedToken;
  } else if (tokenPayload.sessionId) {
    const session = await sessionModel.get(tokenPayload.sessionId);
    assert(session?.refreshToken === token, 401, "error.session_expired");
    sessionModel
      .update(tokenPayload.sessionId, { lastActiveAt: new Date() })
      .catch(() => {});
  }

  return {
    token_type: "Bearer",
    access_token: accessTokenData.token,
    expires_in: accessTokenData.expiresIn,
    refresh_token: refreshToken,
  };
}
