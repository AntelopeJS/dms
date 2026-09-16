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
import { z } from "zod";
import type { AuthResponse } from "./types";

const HTTP_FORBIDDEN = 403;

const switchTenantSchema = z.object({
  refreshToken: z.string().min(1),
  tenantId: z.string().min(1),
});

async function assertMembership(
  userId: string,
  tenantId: string,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const member = await memberModel.getByUser(userId);
  assert(member, HTTP_FORBIDDEN, "error.not_a_member");
}

export async function switchTenant(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: unknown,
): Promise<AuthResponse> {
  const { refreshToken, tenantId } = assertValidation(body, (v) =>
    switchTenantSchema.parse(v),
  );

  const tokenPayload = await validateRefreshToken(refreshToken);

  const user = await userModel.get(tokenPayload.id);
  assert(user, 401, "error.invalid_token");

  await assertMembership(user._id, tenantId);

  if (tokenPayload.sessionId) {
    const session = await sessionModel.get(tokenPayload.sessionId);
    assert(session, 401, "error.session_expired");
    assert(session.refreshToken === refreshToken, 401, "error.session_expired");
    sessionModel
      .update(tokenPayload.sessionId, { lastActiveAt: new Date() })
      .catch(() => {});
  }

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
  const nextRefreshToken = refreshTokenData.token;

  if (tokenPayload.sessionId) {
    await sessionModel.replaceRefreshToken(
      tokenPayload.sessionId,
      nextRefreshToken,
    );
  }

  return {
    token_type: "Bearer",
    access_token: accessTokenData.token,
    expires_in: accessTokenData.expiresIn,
    refresh_token: nextRefreshToken,
  };
}
