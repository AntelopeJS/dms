// Sign-in credentials and sessions of the signed-in user, shared by the
// Security page and the legacy profile routes.

import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type {
  SessionModel,
  User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { notifyPasswordChanged } from "../../../utils/account-notifications";
import { generateSessionHandoffToken } from "../../../implementations/dms-auth/session-handoff";
import { SESSION_HANDOFF_ENDPOINT } from "../../../routes/auth/session-handoff";
import { generateAuthKey } from "../../../utils/auth-key";
import { securitySchema } from "../../../validation/security.schema";
import { assertCurrentPasswordIfSet } from "./current-password";
import { findPendingEmail } from "./email-change";
import {
  extractSessionClaims,
  extractSessionId,
  formatSession,
  type SessionResponse,
} from "./profile-helpers";
import {
  getTwoFactorStatus,
  type TwoFactorStatus,
} from "./two-factor-operations";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import {
  type SecurityAttention,
  securityAttention,
  securityAttentionBadge,
} from "./security-attention";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;

/** Everything the Security page status strip summarises. */
export interface SecurityOverview {
  email: string;
  /** The address a sign-in email change waits on, until its code is entered. */
  pendingEmail: string | null;
  isValidated: boolean;
  hasPassword: boolean;
  passwordChangedAt: Date | null;
  accountCreatedAt: Date;
  twoFactor: TwoFactorStatus;
  activeSessions: number;
  /** What needs the user's attention, most important first. */
  attention: SecurityAttention[];
  /**
   * The tone the Security page's navigation badge takes, the strongest of
   * `attention`; null when nothing needs attention.
   */
  attentionTone: Tone | null;
}

/** The body the frontend server posts to `endpoint` to reopen the session. */
export interface SessionHandoffPayload {
  token: string;
}

/**
 * How the caller's device stays signed in once its tokens were invalidated:
 * the frontend server trades `payload` at `endpoint` for a new token pair
 * (`/auth/establish`).
 */
export interface SessionHandoff {
  endpoint: string;
  payload: SessionHandoffPayload;
}

export interface PasswordChangeResult {
  success: true;
  passwordChangedAt: Date;
  signedOutSessions: number;
  sessionHandoff?: SessionHandoff;
}

export interface SessionsRevokedResult {
  success: true;
  count: number;
  sessionHandoff?: SessionHandoff;
}

export interface SessionContext {
  sessionModel: SessionModel;
  /** `Authorization` header: its token names the current session. */
  authorization: string;
}

export interface PasswordChangeContext extends SessionContext {
  userModel: UserModel;
}

/**
 * @param user The signed-in user
 * @param sessions Session model and the caller's authorization header
 * @returns Sessions, the current one first, then the most recently active
 */
export async function listSessions(
  user: User,
  { sessionModel, authorization }: SessionContext,
): Promise<SessionResponse[]> {
  const currentSessionId = extractSessionId(authorization);
  const sessions = await sessionModel.getByUserId(user._id);
  return sessions
    .map((session) => formatSession(session, currentSessionId))
    .sort(
      (a, b) =>
        Number(b.isCurrent) - Number(a.isCurrent) ||
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    );
}

/**
 * @param user The signed-in user
 * @param id Session to sign out
 * @param sessionModel Model the session is deleted from
 */
export async function revokeSession(
  user: User,
  id: string,
  sessionModel: SessionModel,
): Promise<SessionsRevokedResult> {
  const session = await sessionModel.get(id);
  assert(session, HTTP_NOT_FOUND, "error.session_not_found");
  assert(
    session.userId === String(user._id),
    HTTP_FORBIDDEN,
    "error.unauthorized",
  );
  await sessionModel.delete(id);
  return { success: true, count: 1 };
}

/**
 * Signs out every session, this one included, and rotates the auth key so
 * tokens already issued stop verifying.
 */
export async function revokeAllSessions(
  user: User,
  sessionModel: SessionModel,
  userModel: UserModel,
): Promise<SessionsRevokedResult> {
  const sessions = await sessionModel.getByUserId(user._id);
  await sessionModel.deleteByUserId(user._id);
  user.authKey = generateAuthKey();
  await userModel.update(user);
  return { success: true, count: sessions.length };
}

async function deleteOtherSessions(
  user: User,
  sessionModel: SessionModel,
  currentSessionId: string | undefined,
): Promise<number> {
  const others = (await sessionModel.getByUserId(user._id)).filter(
    (session) => session._id !== currentSessionId,
  );
  for (const session of others) await sessionModel.delete(session._id);
  return others.length;
}

// The handoff takes the session's refresh slot: the refresh token the device
// holds was signed with the old key and is dead anyway, and redeeming the
// handoff rotates it out, so it serves once.
async function handOffCurrentSession(
  user: User,
  { sessionModel, authorization }: SessionContext,
): Promise<SessionHandoff | undefined> {
  const { sessionId, tenantId } = extractSessionClaims(authorization);
  if (!sessionId || !tenantId) return undefined;
  const token = generateSessionHandoffToken(user, tenantId, sessionId);
  await sessionModel.replaceRefreshToken(sessionId, token);
  return { endpoint: SESSION_HANDOFF_ENDPOINT, payload: { token } };
}

/**
 * Signs out every session but the caller's: rotates the auth key, so every
 * token issued so far stops verifying, deletes the other sessions, and hands
 * the caller's session a way back in (`sessionHandoff`). Whatever else the
 * caller changed on `user` is saved with the new key.
 *
 * @param user The signed-in user
 * @param context User model, session model and the caller's authorization header
 */
export async function revokeOtherSessions(
  user: User,
  context: PasswordChangeContext,
): Promise<SessionsRevokedResult> {
  user.authKey = generateAuthKey();
  await context.userModel.update(user);
  const count = await deleteOtherSessions(
    user,
    context.sessionModel,
    extractSessionId(context.authorization),
  );
  const sessionHandoff = await handOffCurrentSession(user, context);
  return { success: true, count, sessionHandoff };
}

/**
 * Changes the password once the current one is proven and signs out every
 * other session (see {@link revokeOtherSessions}).
 *
 * @param user The signed-in user
 * @param body `{ currentPassword, password }`
 * @param context User model and the session context
 */
export async function changePassword(
  user: User,
  body: unknown,
  context: PasswordChangeContext,
): Promise<PasswordChangeResult> {
  const { currentPassword, password } = assertValidation(body, (value) =>
    securitySchema.changePassword.parse(value),
  );
  await assertCurrentPasswordIfSet(context.userModel, user, currentPassword);
  const passwordChangedAt = new Date();
  user.password = password;
  user.passwordChangedAt = passwordChangedAt;
  const revoked = await revokeOtherSessions(user, context);
  fireAndForget(
    notifyPasswordChanged(user._id),
    "password change notification",
  );
  return {
    success: true,
    passwordChangedAt,
    signedOutSessions: revoked.count,
    sessionHandoff: revoked.sessionHandoff,
  };
}

/**
 * @param user The signed-in user
 * @param sessionModel Model the active sessions are counted in
 * @returns The Security page status summary
 */
export async function getSecurityOverview(
  user: User,
  sessionModel: SessionModel,
): Promise<SecurityOverview> {
  const [sessions, pendingEmail] = await Promise.all([
    sessionModel.getByUserId(user._id),
    findPendingEmail(user._id),
  ]);
  const twoFactor = getTwoFactorStatus(user);
  return {
    email: user.email,
    pendingEmail,
    isValidated: !!user.isValidated,
    hasPassword: !!user.password,
    passwordChangedAt: user.passwordChangedAt ?? null,
    accountCreatedAt: user.createdAt,
    twoFactor,
    activeSessions: sessions.length,
    attention: securityAttention(twoFactor),
    attentionTone: securityAttentionBadge(twoFactor).tone ?? null,
  };
}
