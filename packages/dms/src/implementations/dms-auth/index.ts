import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { Send } from "@antelopejs/interface-email";
import type { AdminInviteEmailContext } from "@antelopejs/interface-dms/auth";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { getErrorMessage } from "@antelopejs/interface-dms/base/types";
import { GenerateHtml } from "@antelopejs/interface-dms/html-render";
export * from "./account-emails";
import { AdminInviteTemplate } from "./email-templates";
import { decode, type JwtPayload, sign, verify } from "jsonwebtoken";
import { getAuthConfig, getClientBaseUrl, getConfig } from "../../config";
import {
  type AdminInviteEmailNames,
  buildAdminInviteSignupLink,
  buildAdminInviteSubject,
  decodeUnverified,
  resolveAdminInviteLanguage,
  recordUserActivity,
} from "../../utils";
import {
  isObject,
  isString,
} from "@antelopejs/interface-dms/utils/internal/type-check";
import { generateSecret } from "./token-secret";
import { assertTokenSessionAlive, loadTokenSession } from "./token-session";
import { INVITE_EXPIRY_DAYS } from "@antelopejs/interface-dms/invites";

const HTTP_FORBIDDEN = 403;
const HTTP_UNAUTHORIZED = 401;
const OWNER_ONLY_ERROR_MESSAGE = "Owner-only";
const EMAIL_NOT_VALIDATED_ERROR = "Email not validated";
const NO_JWT_TOKEN_ERROR = "No jwt token provided";
const INVALID_TENANT_ASSIGNMENT_TOKEN_ERROR = "Invalid tenant assignment token";
const INVALID_TWO_FACTOR_TOKEN_ERROR = "error.invalid_2fa_token";
const TWO_FACTOR_TOKEN_PURPOSE = "2fa";
const ACCESS_TOKEN_PURPOSE = "access";
const REFRESH_TOKEN_PURPOSE = "refresh";
const INVALID_SESSION_TOKEN_ERROR = "Invalid session token";

interface TenantTokenInput {
  tenantId: string;
  id: string;
  rawToken: string;
  sessionId?: string;
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
 */
async function validateUserToken(
  data: TenantTokenInput,
  checkEmailValidation: boolean = false,
): Promise<User> {
  const userModel = GetModel(UserModel);

  const [user, session] = await Promise.all([
    userModel.get(data.id),
    loadTokenSession(data.sessionId),
  ]);

  const claims = verifiedSessionClaims(
    data.rawToken,
    user,
    ACCESS_TOKEN_PURPOSE,
  );
  if (!user || !claims) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
  }

  try {
    assertTokenSessionAlive(claims.sessionId, session, user);
  } catch (error: unknown) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, getErrorMessage(error));
  }

  await recordUserActivity(userModel, user);

  if (checkEmailValidation) {
    const config = getAuthConfig();
    if (config.mustValidateEmail && !user.isValidated) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, EMAIL_NOT_VALIDATED_ERROR);
    }
  }

  return user;
}

interface DecodedAuthPayload {
  tenantId: string;
  id: string;
  sessionId?: string;
}

function isSessionPayload(
  payload: string | JwtPayload,
  purpose: string,
): payload is JwtPayload & DecodedAuthPayload {
  return (
    !isString(payload) &&
    payload.purpose === purpose &&
    isString(payload.id) &&
    !!payload.id &&
    isString(payload.tenantId) &&
    !!payload.tenantId &&
    (payload.sessionId === undefined || isString(payload.sessionId))
  );
}

function isDecodedAuthPayload(
  claims: ReturnType<typeof decode>,
): claims is JwtPayload & DecodedAuthPayload {
  return (
    claims !== null &&
    !isString(claims) &&
    isString(claims.id) &&
    isString(claims.tenantId) &&
    (claims.sessionId === undefined || isString(claims.sessionId))
  );
}

/**
 * The claims of a bearer token, read without verifying its signature, or
 * `undefined` when they do not name a user and a tenant: the validator then
 * verifies the token they came with.
 */
function decodedClaims(token: string): DecodedAuthPayload | undefined {
  const claims = decodeUnverified(token);
  return isDecodedAuthPayload(claims) ? claims : undefined;
}

/**
 * The claims of `token` once it is proven to be a `purpose` token signed for
 * `user`, or `undefined`. Every refusal looks the same, so a caller that
 * answers it with one message tells no forged token apart from another.
 */
function verifiedSessionClaims(
  token: string,
  user: User | undefined,
  purpose: string,
): DecodedAuthPayload | undefined {
  if (!user) {
    return undefined;
  }
  try {
    const payload = verify(token, generateSecret(user.authKey), {
      algorithms: ["HS256"],
    });
    return isSessionPayload(payload, purpose) ? payload : undefined;
  } catch {
    return undefined;
  }
}

export namespace internal {
  export const AuthUserAuthenticator = (data: string | undefined) => {
    if (!data) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, NO_JWT_TOKEN_ERROR);
    }
    const result = decodedClaims(data);
    if (!result) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
    }
    return {
      ...result,
      rawToken: data,
    };
  };

  export const IfAuthUserAuthenticator = (data: string | undefined) => {
    const result = data ? decodedClaims(data) : undefined;
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
    } catch {
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
  } catch {
    return true;
  }
}

export function generateAccessToken(
  tenantId: string,
  user: User,
  sessionId?: string,
): TokenResult {
  const config = getAuthConfig();

  const secret = generateSecret(user.authKey);
  const token = sign(
    { id: user._id, tenantId, sessionId, purpose: ACCESS_TOKEN_PURPOSE },
    secret,
    {
      expiresIn: Math.floor(config.accessTokenLifetime / 1000),
    },
  );

  return {
    token,
    expiresIn: config.accessTokenLifetime,
  };
}

export function generateRefreshToken(
  tenantId: string,
  user: User,
  sessionId?: string,
): TokenResult {
  const config = getAuthConfig();
  const secret = generateSecret(user.authKey);

  const token = sign(
    { id: user._id, tenantId, sessionId, purpose: REFRESH_TOKEN_PURPOSE },
    secret,
    {
      expiresIn: Math.floor(config.refreshTokenLifetime / 1000),
    },
  );

  return {
    token,
    expiresIn: config.refreshTokenLifetime,
  };
}

export async function validateRefreshToken(token: string) {
  const result = decodeUnverified(token);
  if (!result || isString(result) || !isString(result.id)) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
  }

  const user = await GetModel(UserModel).get(result.id);
  const claims = verifiedSessionClaims(token, user, REFRESH_TOKEN_PURPOSE);
  if (!claims) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
  }
  return claims;
}

const TWO_FACTOR_TOKEN_LIFETIME_MS = 5 * 60 * 1000;
const TENANT_ASSIGNMENT_TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const TENANT_ASSIGNMENT_PURPOSE = "tenant-assignment";

export function generateTwoFactorToken(
  tenantId: string,
  user: User,
): TokenResult {
  const secret = generateSecret(user.authKey);

  const token = sign(
    { id: user._id, tenantId, purpose: TWO_FACTOR_TOKEN_PURPOSE },
    secret,
    {
      expiresIn: Math.floor(TWO_FACTOR_TOKEN_LIFETIME_MS / 1000),
      jwtid: randomUUID(),
    },
  );

  return { token, expiresIn: TWO_FACTOR_TOKEN_LIFETIME_MS };
}

export function generateTenantAssignmentToken(user: User): TokenResult {
  const secret = generateSecret(user.authKey);
  const token = sign(
    { id: user._id, purpose: TENANT_ASSIGNMENT_PURPOSE },
    secret,
    { expiresIn: Math.floor(TENANT_ASSIGNMENT_TOKEN_LIFETIME_MS / 1000) },
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
  claims: ReturnType<typeof decode>,
  purpose: string,
): claims is JwtPayload & PurposeTokenClaims {
  return (
    claims !== null &&
    !isString(claims) &&
    claims.purpose === purpose &&
    isString(claims.id)
  );
}

function isSignedFor(token: string, user: User): boolean {
  try {
    verify(token, generateSecret(user.authKey));
    return true;
  } catch {
    return false;
  }
}

async function verifyPurposeToken(
  token: string,
  purpose: string,
  refusal: string,
): Promise<VerifiedPurposeToken> {
  const claims = decodeUnverified(token);
  if (!isPurposeClaims(claims, purpose)) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, refusal);
  }
  const user = await GetModel(UserModel).get(claims.id);
  if (!user || !isSignedFor(token, user)) {
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
  if (!isString(claims.tenantId)) {
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

  // oxlint-disable-next-line typescript/no-misused-spread -- Sanitization intentionally copies only the User instance's own enumerable database fields, not prototype methods.
  const result = { ...user };

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
