// Sign-in credentials and sessions of the signed-in user, shared by the
// Security page and the legacy profile routes.

import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type {
  SessionModel,
  User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import {
  notifyEmailChanged,
  notifyPasswordChanged,
} from "../../../utils/account-notifications";
import { generateAuthKey } from "../../../utils/auth-key";
import { securitySchema } from "../../../validation/security.schema";
import {
  assertEmailAvailable,
  extractSessionId,
  formatSession,
  type SessionResponse,
} from "./profile-helpers";
import {
  getTwoFactorStatus,
  type TwoFactorStatus,
} from "./two-factor-operations";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
// 400, not 401: the dashboard treats a 401 as an expired session and signs out.
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";

/** Everything the Security page status strip summarises. */
export interface SecurityOverview {
  email: string;
  isValidated: boolean;
  hasPassword: boolean;
  passwordChangedAt: Date | null;
  accountCreatedAt: Date;
  twoFactor: TwoFactorStatus;
  activeSessions: number;
}

export interface PasswordChangeResult {
  success: true;
  passwordChangedAt: Date;
  signedOutSessions: number;
}

export interface SessionsRevokedResult {
  success: true;
  count: number;
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
 * Proves the caller knows the account password. The stored row is re-read:
 * the guard's copy may predate a change made by another session.
 *
 * @param userModel Model the account is read from
 * @param user The signed-in user
 * @param password Password typed by the user
 */
export async function assertCurrentPassword(
  userModel: UserModel,
  user: User,
  password: string | undefined,
): Promise<void> {
  const stored = await userModel.get(user._id);
  assert(stored?.password, HTTP_BAD_REQUEST, "error.password_not_set");
  assert(
    !!password && stored.testHash("password", password),
    HTTP_BAD_REQUEST,
    INVALID_CURRENT_PASSWORD,
  );
}

/**
 * An account without a password (single sign-on only) sets its first one
 * without a current password: there is nothing to verify against.
 */
async function assertCanSetPassword(
  userModel: UserModel,
  user: User,
  password: string | undefined,
): Promise<void> {
  const stored = await userModel.get(user._id);
  if (!stored?.password) return;
  await assertCurrentPassword(userModel, user, password);
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

/**
 * Signs out every session but the caller's, which stays signed in.
 *
 * @param user The signed-in user
 * @param sessions Session model and the caller's authorization header
 */
export async function revokeOtherSessions(
  user: User,
  { sessionModel, authorization }: SessionContext,
): Promise<SessionsRevokedResult> {
  const currentSessionId = extractSessionId(authorization);
  const others = (await sessionModel.getByUserId(user._id)).filter(
    (session) => session._id !== currentSessionId,
  );
  for (const session of others) await sessionModel.delete(session._id);
  return { success: true, count: others.length };
}

/**
 * Changes the password once the current one is proven, optionally signing
 * out the other sessions.
 *
 * @param user The signed-in user
 * @param body `{ currentPassword, password, signOutOtherSessions? }`
 * @param context User model and the session context
 */
export async function changePassword(
  user: User,
  body: unknown,
  context: PasswordChangeContext,
): Promise<PasswordChangeResult> {
  const { currentPassword, password, signOutOtherSessions } = assertValidation(
    body,
    (value) => securitySchema.changePassword.parse(value),
  );
  await assertCanSetPassword(context.userModel, user, currentPassword);
  const passwordChangedAt = new Date();
  user.password = password;
  user.passwordChangedAt = passwordChangedAt;
  await context.userModel.update(user);
  const revoked = signOutOtherSessions
    ? await revokeOtherSessions(user, context)
    : undefined;
  fireAndForget(
    notifyPasswordChanged(user._id),
    "password change notification",
  );
  return {
    success: true,
    passwordChangedAt,
    signedOutSessions: revoked?.count ?? 0,
  };
}

/**
 * Changes the sign-in email once the current password is proven.
 *
 * @param user The signed-in user
 * @param body `{ email, currentPassword }`
 * @param userModel Model the account is read from and written to
 * @returns The normalized new email
 */
export async function changeEmail(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<string> {
  const { email, currentPassword } = assertValidation(body, (value) =>
    securitySchema.changeEmail.parse(value),
  );
  await assertCurrentPassword(userModel, user, currentPassword);
  const available = await assertEmailAvailable(userModel, email, user._id);
  assert(available !== user.email, HTTP_BAD_REQUEST, "error.email_unchanged");
  user.email = available;
  await userModel.update(user);
  fireAndForget(
    notifyEmailChanged(user._id, available),
    "email change notification",
  );
  return available;
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
  const sessions = await sessionModel.getByUserId(user._id);
  return {
    email: user.email,
    isValidated: !!user.isValidated,
    hasPassword: !!user.password,
    passwordChangedAt: user.passwordChangedAt ?? null,
    accountCreatedAt: user.createdAt,
    twoFactor: getTwoFactorStatus(user),
    activeSessions: sessions.length,
  };
}
