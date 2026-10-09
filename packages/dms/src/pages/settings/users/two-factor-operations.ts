// Two-factor operations shared by the Security page and the legacy profile
// routes, so both URL families keep one behaviour.

import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { generateGoogleQR, generateUrl } from "2fa";
import {
  notifyBackupCodesRegenerated,
  notifyTwoFactorDisabled,
  notifyTwoFactorEnabled,
} from "../../../utils/account-notifications";
import {
  acceptTotpCode,
  assertEmailCodeNotRateLimited,
  consumeEmailCode,
  emailCodeMatches,
  isEmailCodeExpired,
  sendNewEmailCode,
  type TwoFactorMethod,
  verifyTwoFactorCode,
} from "../../../utils/two-factor-codes";
import { authSchema } from "../../../validation/auth.schema";
import { securitySchema } from "../../../validation/security.schema";
import { assertCurrentPasswordIfSet } from "./current-password";
import {
  BACKUP_CODE_COUNT,
  DMS_ISSUER,
  generateBackupCodes,
  generateTotpSecret,
} from "./profile-helpers";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const QR_MODULE_SIZE = 6;
// Quiet zone in modules: scanners need it, even on a dark page.
const QR_MARGIN = 3;
const OTP_AUTH_SECRET_PARAM = "secret";

/** Two-factor state of the signed-in user, without any secret. */
export interface TwoFactorStatus {
  methods: string[];
  hasBackupCodes: boolean;
  backupCodesLeft: number;
  backupCodesTotal: number;
  backupCodesGeneratedAt: Date | null;
  backupCodesSavedAt: Date | null;
}

/** What the authenticator setup dialog needs to enrol an app. */
export interface TotpSetup {
  /** Raw key, kept for clients of the previous response shape. */
  secret: string;
  /** Base32 key an authenticator app accepts when typed by hand. */
  manualKey: string;
  otpAuthUrl: string;
  /** PNG data URL rendered by this server: the key never reaches a third party. */
  qrCode: string;
}

/** Result of turning a method on; codes only when a new set was issued. */
export interface MethodEnabledResult {
  success: true;
  backupCodes?: string[];
}

export interface BackupCodesResult {
  backupCodes: string[];
}

export interface SuccessResult {
  success: true;
}

const methodsOf = (user: User): string[] => user.twoFactorMethods || [];

/**
 * @param user The signed-in user
 * @returns Enabled methods and backup-code bookkeeping
 */
export function getTwoFactorStatus(user: User): TwoFactorStatus {
  const backupCodesLeft = (user.twoFactorBackupCodes || []).length;
  return {
    methods: methodsOf(user),
    hasBackupCodes: backupCodesLeft > 0,
    backupCodesLeft,
    backupCodesTotal: BACKUP_CODE_COUNT,
    backupCodesGeneratedAt: user.twoFactorBackupCodesGeneratedAt ?? null,
    backupCodesSavedAt: user.twoFactorBackupCodesSavedAt ?? null,
  };
}

function renderQrCode(user: User, secret: string): Promise<string> {
  return new Promise((resolve, reject) => {
    generateGoogleQR(
      DMS_ISSUER,
      user.email,
      secret,
      { size: QR_MODULE_SIZE, margin: QR_MARGIN },
      (error, dataUrl) => (error ? reject(error) : resolve(dataUrl)),
    );
  });
}

// Adding a second factor asks for the account password: a borrowed session
// must not enrol a factor of its own and lock the owner out.
async function assertMayAddMethod(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<void> {
  const { currentPassword } = assertValidation(body ?? {}, (value) =>
    securitySchema.addTwoFactorMethod.parse(value),
  );
  await assertCurrentPasswordIfSet(userModel, user, currentPassword);
}

/**
 * Stores a pending TOTP secret until the user proves their app holds it.
 *
 * @param user The signed-in user
 * @param body `{ currentPassword }`, unless the account has no password
 * @param userModel Model the user is written to
 * @returns The key, its otpauth URL and a locally rendered QR code
 */
export async function startTotpSetup(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<TotpSetup> {
  await assertMayAddMethod(user, body, userModel);
  const secret = await generateTotpSecret();
  const otpAuthUrl = generateUrl(DMS_ISSUER, user.email, secret);
  user.twoFactorPendingSecret = secret;
  await userModel.update(user);
  return {
    secret,
    manualKey:
      new URL(otpAuthUrl).searchParams.get(OTP_AUTH_SECRET_PARAM) ?? secret,
    otpAuthUrl,
    qrCode: await renderQrCode(user, secret),
  };
}

function issueBackupCodes(user: User): string[] {
  const codes = generateBackupCodes();
  user.twoFactorBackupCodes = codes.hashed;
  user.twoFactorBackupCodesGeneratedAt = new Date();
  user.twoFactorBackupCodesSavedAt = null;
  return codes.plaintext;
}

/** The first method, or a user left without codes, gets a fresh set. */
function enableMethod(
  user: User,
  method: TwoFactorMethod,
): string[] | undefined {
  const methods = methodsOf(user);
  if (!methods.includes(method)) methods.push(method);
  user.twoFactorMethods = methods;
  const isFirstMethod = methods.length === 1;
  const hasNoCodes = (user.twoFactorBackupCodes || []).length === 0;
  return isFirstMethod || hasNoCodes ? issueBackupCodes(user) : undefined;
}

/**
 * @param user The signed-in user
 * @param body `{ code }` read from the authenticator app
 * @param userModel Model the user is written to
 * @returns Success, with backup codes when a new set was issued
 */
export async function confirmTotpSetup(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<MethodEnabledResult> {
  const { code } = assertValidation(body, (value) =>
    authSchema.confirmTotp.parse(value),
  );
  assert(user.twoFactorPendingSecret, HTTP_BAD_REQUEST, "error.totp_not_setup");
  assert(
    await acceptTotpCode(userModel, user, user.twoFactorPendingSecret, code),
    HTTP_UNAUTHORIZED,
    "error.invalid_2fa_code",
  );
  user.twoFactorSecret = user.twoFactorPendingSecret;
  user.twoFactorPendingSecret = null;
  const backupCodes = enableMethod(user, "totp");
  await userModel.update(user);
  fireAndForget(
    notifyTwoFactorEnabled(user._id, "totp"),
    "two-factor enabled notification",
  );
  return { success: true, backupCodes };
}

// Email codes are being set up: a code went out, the method is not on yet.
const isEmailSetupPending = (user: User): boolean =>
  !methodsOf(user).includes("email") && !!user.twoFactorEmailCode;

/**
 * Emails a code to the account address; the method turns on only once that
 * code comes back, so a mistyped address cannot lock the user out. A setup
 * reopened while its code is still valid sends none: that code still works,
 * and asking for another one waits out the resend limit.
 *
 * @param user The signed-in user
 * @param body `{ currentPassword }`, unless the account has no password
 * @param userModel Model the user is written to
 */
export async function startEmailSetup(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<SuccessResult> {
  const needsCode = !isEmailSetupPending(user) || isEmailCodeExpired(user);
  // Before the password: a wait that only the right password reached would
  // tell a guess was right.
  if (needsCode) assertEmailCodeNotRateLimited(user);
  await assertMayAddMethod(user, body, userModel);
  if (needsCode) await sendNewEmailCode(userModel, user);
  return { success: true };
}

/**
 * @param user The signed-in user
 * @param body `{ code }` received at the account address
 * @param userModel Model the user is written to
 * @returns Success, with backup codes when a new set was issued
 */
export async function confirmEmailSetup(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<MethodEnabledResult> {
  const { code } = assertValidation(body, (value) =>
    authSchema.confirmEmailMethod.parse(value),
  );
  assert(
    user.twoFactorEmailCode && !isEmailCodeExpired(user),
    HTTP_BAD_REQUEST,
    "error.2fa_code_expired",
  );
  assert(
    emailCodeMatches(user, code),
    HTTP_UNAUTHORIZED,
    "error.invalid_2fa_code",
  );
  consumeEmailCode(user);
  const backupCodes = enableMethod(user, "email");
  await userModel.update(user);
  fireAndForget(
    notifyTwoFactorEnabled(user._id, "email"),
    "two-factor enabled notification",
  );
  return { success: true, backupCodes };
}

function clearTwoFactorLeftovers(user: User): void {
  user.twoFactorBackupCodes = [];
  user.twoFactorBackupCodesGeneratedAt = null;
  user.twoFactorBackupCodesSavedAt = null;
  user.twoFactorEmailCode = null;
  user.twoFactorEmailCodeRequestedAt = null;
}

/**
 * Removes one method after a code from that same method proves possession.
 *
 * @param user The signed-in user
 * @param body `{ method, code }`
 * @param userModel Model the user is written to
 */
export async function disableTwoFactorMethod(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<SuccessResult> {
  const { method, code } = assertValidation(body, (value) =>
    authSchema.disableTwoFactor.parse(value),
  );
  assert(
    await verifyTwoFactorCode(userModel, user, method, code),
    HTTP_UNAUTHORIZED,
    "error.invalid_2fa_code",
  );
  const methods = methodsOf(user).filter((entry) => entry !== method);
  user.twoFactorMethods = methods;
  if (method === "totp") user.twoFactorSecret = null;
  if (methods.length === 0) clearTwoFactorLeftovers(user);
  await userModel.update(user);
  fireAndForget(
    notifyTwoFactorDisabled(user._id, method),
    "two-factor disabled notification",
  );
  return { success: true };
}

// One method after the other: a code that passes is used up, so it must not
// be tried against a second method once one accepted it.
async function isValidCodeForAnyMethod(
  userModel: UserModel,
  user: User,
  code: string,
): Promise<boolean> {
  for (const method of methodsOf(user) as TwoFactorMethod[]) {
    if (await verifyTwoFactorCode(userModel, user, method, code)) return true;
  }
  return false;
}

/**
 * Replaces every backup code; the previous ones stop working at once.
 *
 * @param user The signed-in user
 * @param body `{ code }` from any enabled method
 * @param userModel Model the user is written to
 * @returns The new codes, in clear, shown to the user once
 */
export async function regenerateBackupCodes(
  user: User,
  body: unknown,
  userModel: UserModel,
): Promise<BackupCodesResult> {
  const { code } = assertValidation(body, (value) =>
    authSchema.regenerateBackup.parse(value),
  );
  assert(methodsOf(user).length > 0, HTTP_BAD_REQUEST, "error.2fa_not_enabled");
  assert(
    await isValidCodeForAnyMethod(userModel, user, code),
    HTTP_UNAUTHORIZED,
    "error.invalid_2fa_code",
  );
  const previousCount = user.twoFactorBackupCodes?.length ?? 0;
  const backupCodes = issueBackupCodes(user);
  await userModel.update(user);
  fireAndForget(
    notifyBackupCodesRegenerated(user._id, previousCount),
    "backup codes regenerated notification",
  );
  return { backupCodes };
}

/**
 * Records that the user kept the current codes (downloaded, copied or
 * acknowledged), which clears the "not saved" warning.
 *
 * @param user The signed-in user
 * @param userModel Model the user is written to
 * @returns The refreshed two-factor status
 */
export async function markBackupCodesSaved(
  user: User,
  userModel: UserModel,
): Promise<TwoFactorStatus> {
  assert(
    (user.twoFactorBackupCodes || []).length > 0,
    HTTP_BAD_REQUEST,
    "error.no_backup_codes",
  );
  user.twoFactorBackupCodesSavedAt = new Date();
  await userModel.update(user);
  return getTwoFactorStatus(user);
}

/**
 * Emails a one-time code, at most once per rate-limit window: for the email
 * method, or again for its pending setup.
 *
 * @param user The signed-in user
 * @param userModel Model the user is written to
 */
export async function requestTwoFactorEmailCode(
  user: User,
  userModel: UserModel,
): Promise<SuccessResult> {
  assert(
    methodsOf(user).includes("email") || isEmailSetupPending(user),
    HTTP_BAD_REQUEST,
    "error.2fa_email_not_enabled",
  );
  await sendNewEmailCode(userModel, user);
  return { success: true };
}
