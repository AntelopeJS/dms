import { assert } from "@antelopejs/interface-api-util";
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
import { authSchema } from "../../validation";
import type { AuthResponse } from "./types";

export const HTTP_FORBIDDEN = 403;

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
  body: ReturnType<typeof authSchema.refresh.parse>,
): Promise<AuthResponse> {
  const { token } = body;

  const tokenPayload = await validateRefreshToken(token);
  assert(tokenPayload.sessionId, 401, "error.invalid_token");

  const user = await userModel.get(tokenPayload.id);
  assert(user, 401, "error.invalid_token");

  const { tenantId } = tokenPayload;
  assert(tenantId, 401, "error.invalid_token");
  await assertTenantAccess(user, tenantId);

  const accessTokenData = await generateAccessToken(
    tenantId,
    user,
    tokenPayload.sessionId,
  );

  const refreshTokenData = await generateRefreshToken(
    tenantId,
    user,
    tokenPayload.sessionId,
  );
  const refreshToken = await sessionModel.rotateRefreshToken(
    tokenPayload.sessionId,
    token,
    refreshTokenData.token,
  );
  assert(refreshToken, 401, "error.session_expired");

  return {
    token_type: "Bearer",
    access_token: accessTokenData.token,
    expires_in: accessTokenData.expiresIn,
    refresh_token: refreshToken,
  };
}
