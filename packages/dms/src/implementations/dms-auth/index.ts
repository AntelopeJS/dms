import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  GetModel,
  toDatabase,
} from "@antelopejs/interface-database-decorators";
import { Send } from "@antelopejs/interface-email";
import type { AdminInviteEmailContext } from "@antelopejs/interface-dms/auth";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { getErrorMessage } from "@antelopejs/interface-dms/base/types";
import { GenerateHtml } from "@antelopejs/interface-dms/html-render";
export * from "./account-emails";
import { AdminInviteTemplate } from "./email-templates";
import type { JwtPayload } from "jsonwebtoken";
import { getAuthConfig, getClientBaseUrl, getConfig } from "../../config";
import {
  type AdminInviteEmailNames,
  buildAdminInviteSignupLink,
  buildAdminInviteSubject,
  resolveAdminInviteLanguage,
  recordUserActivity,
} from "../../utils";
import {
  isObject,
  isString,
} from "@antelopejs/interface-dms/utils/internal/type-check";
import {
  loadTokenUser,
  signUserToken,
  type VerifiedSessionClaims,
  verifiedSessionClaims,
  verifyUserToken,
} from "./token-secret";
import { assertTokenSessionAlive, loadTokenSession } from "./token-session";
import { DatabaseUnavailable, readBeforeDeadline } from "./database-deadline";
import { INVITE_EXPIRY_DAYS } from "@antelopejs/interface-dms/invites";

const HTTP_FORBIDDEN = 403;
const HTTP_UNAUTHORIZED = 401;
const OWNER_ONLY_ERROR_MESSAGE = "$dms.refusals.auth.owner_only";
const EMAIL_NOT_VALIDATED_ERROR = "$dms.refusals.auth.email_not_validated";
const NO_JWT_TOKEN_ERROR = "$dms.refusals.auth.no_token_provided";
const INVALID_TENANT_ASSIGNMENT_TOKEN_ERROR = "Invalid tenant assignment token";
const INVALID_TWO_FACTOR_TOKEN_ERROR = "error.invalid_2fa_token";
const TWO_FACTOR_TOKEN_PURPOSE = "2fa";
const ACCESS_TOKEN_PURPOSE = "access";
const REFRESH_TOKEN_PURPOSE = "refresh";
const INVALID_SESSION_TOKEN_ERROR = "$dms.refusals.auth.invalid_session_token";
const MISSING_SESSION_ID_ERROR = "An access or refresh token needs a sessionId";

interface TenantTokenInput {
  tenantId: string;
  id: string;
  rawToken: string;
}

interface TokenResult {
  token: string;
  expiresIn: number;
}

/**
 * Common validation logic for user tokens
 * @param data Token data with tenantId, id, and raw token
 * @param checkEmailValidation Whether to enforce email validation requirement
 * @returns Validated user
 * @throws HTTPResult(401) if validation fails
 * @throws HTTPResult(503) when the database cannot be read to verify the session
 */
async function validateUserToken(
  data: TenantTokenInput,
  checkEmailValidation: boolean = false,
): Promise<User> {
  const { claims, user } = await verifiedSession(
    data.rawToken,
    ACCESS_TOKEN_PURPOSE,
  );

  const session = await readBeforeDeadline(() =>
    loadTokenSession(claims.sessionId),
  );
  try {
    assertTokenSessionAlive(claims.sessionId, session, user);
  } catch (error: unknown) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, getErrorMessage(error));
  }

  void recordUserActivity(GetModel(UserModel), user).catch((error: unknown) => {
    Logging.Warn(
      `[DMS-AUTH] could not record the activity of "${user._id}"`,
      error,
    );
  });

  if (checkEmailValidation) {
    const config = getAuthConfig();
    if (config.mustValidateEmail && !user.isValidated) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, EMAIL_NOT_VALIDATED_ERROR);
    }
  }

  return user;
}

function isSessionPayload(
  payload: string | JwtPayload,
  purpose: string,
): payload is JwtPayload & VerifiedSessionClaims {
  return (
    !isString(payload) &&
    payload.purpose === purpose &&
    isString(payload.id) &&
    !!payload.id &&
    isString(payload.tenantId) &&
    !!payload.tenantId &&
    isString(payload.sessionId) &&
    !!payload.sessionId
  );
}

/**
 * The claims of `token` and the user it names, once its signature proves it a
 * `purpose` token and the user still holds the key it was issued under. The
 * user is read only after the signature checks out, and every refusal is the
 * same 401.
 *
 * @throws HTTPResult(401) for any token that is not a live `purpose` token
 * @throws HTTPResult(503) when the database cannot be read to verify it
 */
async function verifiedSession(
  token: string,
  purpose: string,
): Promise<{ claims: VerifiedSessionClaims; user: User }> {
  const claims = verifyUserToken(token);
  if (!claims || !isSessionPayload(claims, purpose)) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
  }
  const user = await readBeforeDeadline(() => loadTokenUser(claims));
  if (!user) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
  }
  return { claims, user };
}

export namespace internal {
  export const AuthUserAuthenticator = (data: string | undefined) => {
    if (!data) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, NO_JWT_TOKEN_ERROR);
    }
    const result = verifiedSessionClaims(data);
    if (!result) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
    }
    return {
      ...result,
      rawToken: data,
    };
  };

  export const IfAuthUserAuthenticator = (data: string | undefined) => {
    const result = data ? verifiedSessionClaims(data) : undefined;
    return data && result ? { ...result, rawToken: data } : undefined;
  };

  export const AuthRawUserValidator = async (data: TenantTokenInput) => {
    return validateUserToken(data, false);
  };

  export const AuthUserValidator = async (data: TenantTokenInput) => {
    return validateUserToken(data, true);
  };

  export const IfAuthUserValidator = async (
    data: TenantTokenInput | undefined,
  ): Promise<User | undefined> => {
    if (!data) {
      return undefined;
    }
    try {
      return await validateUserToken(data, true);
    } catch (error: unknown) {
      if (error instanceof DatabaseUnavailable) throw error;
      return undefined;
    }
  };

  export const AuthOwnerOnlyValidator = async (data: TenantTokenInput) => {
    const user = await validateUserToken(data, true);
    if (!user.owner) {
      throw new HTTPResult(HTTP_FORBIDDEN, OWNER_ONLY_ERROR_MESSAGE);
    }
    return user;
  };
}

const BEARER_SCHEME = /^Bearer\s+(\S+)$/i;

/**
 * Whether a request carries a bearer token the DMS no longer accepts: expired,
 * signed with a rotated key, bound to a signed-out session, or naming a user
 * that is gone. `IfAuthUser` reads such a request as anonymous; this tells it
 * apart from one that sent nothing.
 * An unvalidated e-mail is not a rejection — the token itself is still good.
 *
 * @param authorization The raw `authorization` header, possibly absent
 * @throws HTTPResult(503) when the database cannot be read to verify the token
 */
export async function isRejectedBearerToken(
  authorization: string | undefined,
): Promise<boolean> {
  const token = authorization?.match(BEARER_SCHEME)?.[1];
  if (!token) {
    return false;
  }
  const data = internal.IfAuthUserAuthenticator(token);
  if (!data) {
    return true;
  }
  try {
    await validateUserToken(data, false);
    return false;
  } catch (error: unknown) {
    if (error instanceof DatabaseUnavailable) throw error;
    return true;
  }
}

function requireSessionId(sessionId: string | undefined): string {
  if (!sessionId) {
    throw new Error(MISSING_SESSION_ID_ERROR);
  }
  return sessionId;
}

/**
 * Sign an access token bound to the session `sessionId`.
 *
 * @throws Error when `sessionId` is missing or empty
 */
export function generateAccessToken(
  tenantId: string,
  user: User,
  sessionId?: string,
): TokenResult {
  const config = getAuthConfig();
  const token = signUserToken(
    user,
    {
      tenantId,
      sessionId: requireSessionId(sessionId),
      purpose: ACCESS_TOKEN_PURPOSE,
    },
    Math.floor(config.accessTokenLifetime / 1000),
  );

  return {
    token,
    expiresIn: config.accessTokenLifetime,
  };
}

/**
 * Sign a refresh token bound to the session `sessionId`.
 *
 * @throws Error when `sessionId` is missing or empty
 */
export function generateRefreshToken(
  tenantId: string,
  user: User,
  sessionId?: string,
): TokenResult {
  const config = getAuthConfig();
  const token = signUserToken(
    user,
    {
      tenantId,
      sessionId: requireSessionId(sessionId),
      purpose: REFRESH_TOKEN_PURPOSE,
      jti: randomUUID(),
    },
    Math.floor(config.refreshTokenLifetime / 1000),
  );

  return {
    token,
    expiresIn: config.refreshTokenLifetime,
  };
}

export async function validateRefreshToken(token: string) {
  const { claims } = await verifiedSession(token, REFRESH_TOKEN_PURPOSE);
  return claims;
}

const TWO_FACTOR_TOKEN_LIFETIME_MS = 5 * 60 * 1000;
const TENANT_ASSIGNMENT_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const TENANT_ASSIGNMENT_PURPOSE = "tenant-assignment";

export function generateTwoFactorToken(
  tenantId: string,
  user: User,
): TokenResult {
  const token = signUserToken(
    user,
    { tenantId, purpose: TWO_FACTOR_TOKEN_PURPOSE, jti: randomUUID() },
    Math.floor(TWO_FACTOR_TOKEN_LIFETIME_MS / 1000),
  );

  return { token, expiresIn: TWO_FACTOR_TOKEN_LIFETIME_MS };
}

export function generateTenantAssignmentToken(user: User): TokenResult {
  const token = signUserToken(
    user,
    { purpose: TENANT_ASSIGNMENT_PURPOSE },
    Math.floor(TENANT_ASSIGNMENT_TOKEN_LIFETIME_MS / 1000),
  );
  return { token, expiresIn: TENANT_ASSIGNMENT_TOKEN_LIFETIME_MS };
}

interface PurposeTokenClaims {
  id: string;
  purpose: string;
}

interface VerifiedPurposeToken {
  claims: JwtPayload & PurposeTokenClaims;
  user: User;
}

function isPurposeClaims(
  claims: JwtPayload | null,
  purpose: string,
): claims is JwtPayload & PurposeTokenClaims {
  return claims !== null && claims.purpose === purpose && isString(claims.id);
}

async function verifyPurposeToken(
  token: string,
  purpose: string,
  refusal: string,
): Promise<VerifiedPurposeToken> {
  const claims = verifyUserToken(token);
  if (!isPurposeClaims(claims, purpose)) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, refusal);
  }
  const user = await readBeforeDeadline(() => loadTokenUser(claims));
  if (!user) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, refusal);
  }
  return { claims, user };
}

export async function validateTenantAssignmentToken(token: string) {
  const { claims, user } = await verifyPurposeToken(
    token,
    TENANT_ASSIGNMENT_PURPOSE,
    INVALID_TENANT_ASSIGNMENT_TOKEN_ERROR,
  );
  return { id: claims.id, user };
}

export async function validateTwoFactorToken(token: string) {
  const { claims, user } = await verifyPurposeToken(
    token,
    TWO_FACTOR_TOKEN_PURPOSE,
    INVALID_TWO_FACTOR_TOKEN_ERROR,
  );
  if (!isString(claims.tenantId) || !isString(claims.jti)) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_TWO_FACTOR_TOKEN_ERROR);
  }
  return { ...claims, tenantId: claims.tenantId, user };
}

const BUILTIN_SENSITIVE_USER_KEYS: string[] = [
  "_internal",
  "validationToken",
  "validationRequestedAt",
  "forgotPasswordRequestedAt",
  "forgotPasswordToken",
  "authKey",
  "twoFactorSecret",
  "twoFactorPendingSecret",
  "twoFactorTotpLastStep",
  "twoFactorBackupCodes",
  "twoFactorEmailCode",
  "twoFactorEmailCodeRequestedAt",
];

function isPropertyBag(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value !== null;
}

function deleteNestedKey(target: User, dottedKey: string) {
  const parts = dottedKey.split(".");
  let current: unknown = target;

  for (let i = 0; i < parts.length - 1; i++) {
    if (isPropertyBag(current) && parts[i] in current) {
      current = current[parts[i]];
    } else {
      return;
    }
  }

  if (isPropertyBag(current) && parts.length > 0) {
    delete current[parts[parts.length - 1]];
  }
}

export function sanitizeUser(user: User): Partial<User> {
  const config = getAuthConfig();
  const sensitiveKeys = [
    ...BUILTIN_SENSITIVE_USER_KEYS,
    ...config.userSensitiveKeys,
  ];

  const result = toDatabase(user);

  for (const key of sensitiveKeys) {
    if (key.includes(".")) {
      deleteNestedKey(result, key);
    } else {
      Reflect.deleteProperty(result, key);
    }
  }

  return result;
}

export async function sendAdminInviteEmail(
  email: string,
  token: string,
  inviteeName?: string,
  context: AdminInviteEmailContext = {},
): Promise<void> {
  const signupLink = buildAdminInviteSignupLink(getClientBaseUrl() ?? "", {
    email,
    token,
    inviteeName,
    language: context.language,
  });
  const language = resolveAdminInviteLanguage(context.language);
  const names: AdminInviteEmailNames = {
    workspaceName: context.workspaceName,
    inviterName: context.inviterName,
    platformName: getConfig().meta?.title || undefined,
  };

  const html = await GenerateHtml(
    AdminInviteTemplate,
    {
      email,
      signupLink,
      expiresInDays: INVITE_EXPIRY_DAYS,
      ...names,
    },
    language,
  );

  const result = await Send({
    to: email,
    subject: buildAdminInviteSubject(names, language),
    html,
  });

  if (!result.success) {
    Logging.Error(
      `[DMS-AUTH] Failed to send invite email to "${email}": ${result.error?.message}`,
    );
    throw new Error(`Failed to send email: ${result.error?.message}`);
  }

  Logging.Info(`[DMS-AUTH] Invite email sent to "${email}"`);
}

export { notifyWelcome as NotifyWelcome } from "../../utils";
export { notifyCollaboratorJoined as NotifyCollaboratorJoined } from "../../hooks";
export { parseUserAgent as ParseUserAgent } from "../../utils";
