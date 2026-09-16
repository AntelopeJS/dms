import {
  createSession,
  generateAccessToken,
  generateRefreshToken,
  generateTenantAssignmentToken,
  generateTwoFactorToken,
  sanitizeUser,
} from "@antelopejs/interface-dms/auth";
import type { SessionModel, User } from "@antelopejs/interface-dms/auth/db";
import { notifyNewLogin } from "../../utils/account-notifications";
import { pickInitialTenantId } from "./pick-tenant";
import type {
  AuthResponse,
  TenantAssignmentRequiredResponse,
  TwoFactorRequiredResponse,
} from "./types";

export type LoginOutcome =
  | AuthResponse
  | TwoFactorRequiredResponse
  | TenantAssignmentRequiredResponse;

/**
 * Open a session for an already authenticated user and mint its token pair.
 *
 * @param sessionModel Sessions model
 * @param tenantId Tenant the session is scoped to
 * @param user Authenticated user
 * @param userAgent Requesting user agent
 * @param ip Requesting IP
 * @returns Bearer token payload
 */
export async function issueAuthResponse(
  sessionModel: SessionModel,
  tenantId: string,
  user: User,
  userAgent: string,
  ip: string,
): Promise<AuthResponse> {
  const sessionId = await createSession(sessionModel, user._id, userAgent, ip);

  const accessTokenData = await generateAccessToken(tenantId, user, sessionId);
  const refreshTokenData = await generateRefreshToken(
    tenantId,
    user,
    sessionId,
  );

  await sessionModel.replaceRefreshToken(sessionId, refreshTokenData.token);

  return {
    token_type: "Bearer",
    access_token: accessTokenData.token,
    expires_in: accessTokenData.expiresIn,
    refresh_token: refreshTokenData.token,
    user: await sanitizeUser(user),
  };
}

/**
 * Turn a proven identity into the outcome a login endpoint returns: a session,
 * a two-factor challenge, or a tenant assignment handover when the user
 * belongs to no workspace yet.
 *
 * Shared by every entry point that authenticates an existing account, so all
 * of them enforce the same second factor and workspace prerequisites.
 *
 * @param sessionModel Sessions model
 * @param user Authenticated user
 * @param userAgent Requesting user agent
 * @param ip Requesting IP
 * @returns Session, two-factor challenge, or tenant assignment handover
 */
export async function resolveLoginOutcome(
  sessionModel: SessionModel,
  user: User,
  userAgent: string,
  ip: string,
  preferredTenantId?: string,
): Promise<LoginOutcome> {
  // A login that just consumed an invitation belongs in the tenant that
  // invited, not in the account's oldest membership — otherwise accepting an
  // invitation to a second workspace signs the user into the first one, with
  // the invitation already burned and nothing saying the new one was joined.
  const tenantId = preferredTenantId ?? (await pickInitialTenantId(user._id));

  if (tenantId === undefined) {
    const { token: assignmentToken } =
      await generateTenantAssignmentToken(user);
    return {
      requires_tenant_assignment: true,
      tenant_assignment_token: assignmentToken,
      user: await sanitizeUser(user),
    };
  }

  if (user.twoFactorMethods?.length > 0) {
    const { token } = await generateTwoFactorToken(tenantId, user);
    return {
      requires_2fa: true,
      two_factor_token: token,
      methods: user.twoFactorMethods,
    };
  }

  void notifyNewLogin(user._id, userAgent, ip);

  return issueAuthResponse(sessionModel, tenantId, user, userAgent, ip);
}
