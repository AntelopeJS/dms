import { HTTPResult } from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { Send } from "@antelopejs/interface-email";
import type { AdminInviteEmailContext } from "@antelopejs/interface-dms/auth";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { getErrorMessage } from "@antelopejs/interface-dms/base/types";
import {
  GenerateHtml,
  RegisterHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";
import { decode, sign, verify } from "jsonwebtoken";
import { getAuthConfig, getClientBaseUrl, getConfig } from "../../config";
import {
  type AdminInviteEmailNames,
  buildAdminInviteSubject,
  resolveAdminInviteLanguage,
} from "../../utils/admin-invite-email";
import { isObject } from "@antelopejs/interface-dms/utils/type-check";
import { INVITE_EXPIRY_DAYS } from "@antelopejs/interface-dms/invites";

const HTTP_FORBIDDEN = 403;
const HTTP_UNAUTHORIZED = 401;
const OWNER_ONLY_ERROR_MESSAGE = "Owner-only";
const INVALID_USER_ERROR = "Invalid user";
const EMAIL_NOT_VALIDATED_ERROR = "Email not validated";
const NO_JWT_TOKEN_ERROR = "No jwt token provided";
const INVALID_TENANT_ASSIGNMENT_TOKEN_ERROR = "Invalid tenant assignment token";
const INVALID_TWO_FACTOR_TOKEN_ERROR = "Invalid 2FA token";
const TWO_FACTOR_TOKEN_PURPOSE = "2fa";
const ACCESS_TOKEN_PURPOSE = "access";
const REFRESH_TOKEN_PURPOSE = "refresh";
const INVALID_SESSION_TOKEN_ERROR = "Invalid session token";
const MILLISECONDS_PER_HOUR = 1000 * 60 * 60;

interface TenantTokenInput {
  tenantId: string;
  id: string;
  rawToken: string;
}

interface TokenResult {
  token: string;
  expiresIn: number;
}

interface ResetPasswordData {
  userName: string;
  resetCode: string;
  expiresIn: string;
}

interface EmailValidationData {
  userName: string;
  validationCode: string;
  expiresIn: string;
}

interface AdminInviteData extends AdminInviteEmailNames {
  email: string;
  signupLink: string;
  expiresInDays: number;
}

const ResetPasswordTemplate =
  RegisterHtmlTemplate<ResetPasswordData>("EmailResetPassword");

const EmailValidationTemplate = RegisterHtmlTemplate<EmailValidationData>(
  "EmailUserValidation",
);

const AdminInviteTemplate =
  RegisterHtmlTemplate<AdminInviteData>("EmailAdminInvite");

function generateSecret(key: string) {
  const secret = getAuthConfig().jwtSecret;
  const session = 1;
  return `${session}:${key}:${secret}`;
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
  const user = await userModel.get(data.id);

  if (!user) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_USER_ERROR);
  }

  try {
    const secret = generateSecret(user.authKey);
    verifySessionToken(data.rawToken, secret, ACCESS_TOKEN_PURPOSE);
  } catch (error: unknown) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, getErrorMessage(error));
  }

  userModel.update(data.id, user).catch(() => {});

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

function verifySessionToken(
  token: string,
  secret: string,
  purpose: string,
): DecodedAuthPayload {
  const payload = verify(token, secret, { algorithms: ["HS256"] });
  if (
    typeof payload === "string" ||
    payload.purpose !== purpose ||
    typeof payload.id !== "string" ||
    !payload.id ||
    typeof payload.tenantId !== "string" ||
    !payload.tenantId
  ) {
    throw new Error(INVALID_SESSION_TOKEN_ERROR);
  }
  return payload as DecodedAuthPayload;
}

export namespace internal {
  export const AuthUserAuthenticator = (data: string | undefined) => {
    if (!data) {
      throw new HTTPResult(HTTP_UNAUTHORIZED, NO_JWT_TOKEN_ERROR);
    }
    const result = decode(data) as DecodedAuthPayload;
    return {
      ...result,
      rawToken: data,
    };
  };

  export const IfAuthUserAuthenticator = (data: string | undefined) => {
    if (!data) {
      return undefined;
    }
    try {
      const result = decode(data) as DecodedAuthPayload;
      return {
        ...result,
        rawToken: data,
      };
    } catch {
      return undefined;
    }
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
 * signed with a rotated key, or naming a user that is gone. `IfAuthUser` reads
 * such a request as anonymous; this tells it apart from one that sent nothing.
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
  const result = decode(token);
  if (!result || typeof result === "string" || typeof result.id !== "string") {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_SESSION_TOKEN_ERROR);
  }

  const userModel = GetModel(UserModel);
  const user = await userModel.get(result.id);

  if (!user) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_USER_ERROR);
  }

  try {
    const secret = generateSecret(user.authKey);
    return verifySessionToken(token, secret, REFRESH_TOKEN_PURPOSE);
  } catch (error: unknown) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, getErrorMessage(error));
  }
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
    { expiresIn: Math.floor(TWO_FACTOR_TOKEN_LIFETIME_MS / 1000) },
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

interface TenantAssignmentDecoded {
  id?: string;
  purpose?: string;
}

interface TwoFactorDecoded {
  id: string;
  tenantId: string;
  purpose?: string;
}

export async function validateTenantAssignmentToken(token: string) {
  const result = decode(token) as TenantAssignmentDecoded | null;

  if (!result || result.purpose !== TENANT_ASSIGNMENT_PURPOSE || !result.id) {
    throw new HTTPResult(
      HTTP_UNAUTHORIZED,
      INVALID_TENANT_ASSIGNMENT_TOKEN_ERROR,
    );
  }

  const userModel = GetModel(UserModel);
  const user = await userModel.get(result.id);

  if (!user) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_USER_ERROR);
  }

  try {
    const secret = generateSecret(user.authKey);
    verify(token, secret);
  } catch (error: unknown) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, getErrorMessage(error));
  }

  return { id: result.id, user };
}

export async function validateTwoFactorToken(token: string) {
  const result = decode(token) as TwoFactorDecoded;

  if (result.purpose !== TWO_FACTOR_TOKEN_PURPOSE) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_TWO_FACTOR_TOKEN_ERROR);
  }

  const userModel = GetModel(UserModel);
  const user = await userModel.get(result.id);

  if (!user) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_USER_ERROR);
  }

  try {
    const secret = generateSecret(user.authKey);
    verify(token, secret);
  } catch (error: unknown) {
    throw new HTTPResult(HTTP_UNAUTHORIZED, getErrorMessage(error));
  }

  return { ...result, user };
}

interface TwoFactorEmailData {
  userName: string;
  verificationCode: string;
}

const TwoFactorEmailTemplate =
  RegisterHtmlTemplate<TwoFactorEmailData>("EmailTwoFactor");

export async function send2FAEmail(user: User, code: string): Promise<void> {
  const html = await GenerateHtml(
    TwoFactorEmailTemplate,
    {
      userName: user.name || user.email,
      verificationCode: code,
    },
    user.language,
  );

  const result = await Send({
    to: user.email,
    subject: "Your verification code",
    html,
  });

  if (!result.success) {
    Logging.Error(
      `[DMS-AUTH] Failed to send 2FA email to "${user.email}": ${result.error?.message}`,
    );
    throw new Error(`Failed to send email: ${result.error?.message}`);
  }

  Logging.Info(`[DMS-AUTH] 2FA email sent to "${user.email}"`);
}

export async function sendEmailValidationEmail(user: User): Promise<void> {
  const authConfig = getAuthConfig();
  const expiryHours =
    authConfig.emailValidationTokenLifetime / MILLISECONDS_PER_HOUR;

  const html = await GenerateHtml(
    EmailValidationTemplate,
    {
      userName: user.name || user.email,
      validationCode: user.validationToken,
      expiresIn: `${expiryHours} hours`,
    },
    user.language,
  );

  const result = await Send({
    to: user.email,
    subject: "Verify Your Email",
    html,
  });

  if (!result.success) {
    Logging.Error(
      `[DMS-AUTH] Failed to send validation email to "${user.email}": ${result.error?.message}`,
    );
    throw new Error(`Failed to send email: ${result.error?.message}`);
  }

  Logging.Info(`[DMS-AUTH] Validation email sent to "${user.email}"`);
}

export async function sendEmailForgotEmail(user: User): Promise<void> {
  const authConfig = getAuthConfig();

  const expiryHours =
    authConfig.passwordRecoverTokenLifetime / MILLISECONDS_PER_HOUR;

  const html = await GenerateHtml(
    ResetPasswordTemplate,
    {
      userName: user.name || user.email,
      resetCode: user.forgotPasswordToken,
      expiresIn: `${expiryHours} hours`,
    },
    user.language,
  );

  const result = await Send({
    to: user.email,
    subject: "Reset Your Password",
    html,
  });

  if (!result.success) {
    Logging.Error(
      `[DMS-AUTH] Failed to send reset password email to "${user.email}": ${result.error?.message}`,
    );
    throw new Error(`Failed to send email: ${result.error?.message}`);
  }

  Logging.Info(`[DMS-AUTH] Reset password email sent to "${user.email}"`);
}

const BUILTIN_SENSITIVE_USER_KEYS: string[] = [
  "_internal",
  "validationToken",
  "validationRequestedAt",
  "forgotPasswordRequestedAt",
  "forgotPasswordToken",
  "authKey",
  "twoFactorSecret",
  "twoFactorBackupCodes",
  "twoFactorEmailCode",
  "twoFactorEmailCodeRequestedAt",
];

function deleteNestedKey(target: Record<string, unknown>, dottedKey: string) {
  const parts = dottedKey.split(".");
  let current: unknown = target;

  for (let i = 0; i < parts.length - 1; i++) {
    if (isObject(current) && current !== null && parts[i] in current) {
      current = (current as Record<string, unknown>)[parts[i]];
    } else {
      return;
    }
  }

  if (isObject(current) && current !== null && parts.length > 0) {
    delete (current as Record<string, unknown>)[parts[parts.length - 1]];
  }
}

export function sanitizeUser(user: User): Partial<User> {
  const config = getAuthConfig();
  const sensitiveKeys = [
    ...BUILTIN_SENSITIVE_USER_KEYS,
    ...config.userSensitiveKeys,
  ];

  // Unlike the other spread rows, `User` extends `Table.with(HashModifier)`
  // and does carry a prototype method, `testHash`. It is not needed here: what
  // this builds is the redacted copy that goes out as JSON, and the only
  // `testHash` call is made on the model row, not on this.
  // oxlint-disable-next-line typescript/no-misused-spread
  const result = { ...user };

  for (const key of sensitiveKeys) {
    if (key.includes(".")) {
      deleteNestedKey(result as Record<string, unknown>, key);
    } else {
      delete result[key as keyof User];
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
  const nameParam = inviteeName
    ? `&name=${encodeURIComponent(inviteeName)}`
    : "";
  const signupLink = `${getClientBaseUrl()}/auth/signup?token=${token}&email=${encodeURIComponent(email)}${nameParam}`;
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

export {
  notifyCollaboratorJoined as NotifyCollaboratorJoined,
  notifyWelcome as NotifyWelcome,
} from "../../utils/account-notifications";
export { parseUserAgent as ParseUserAgent } from "../../utils/user-agent";
