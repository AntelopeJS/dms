import crypto from "node:crypto";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  createSession,
  generateAccessToken,
  generateRefreshToken,
  sanitizeUser,
  validateTwoFactorToken,
} from "@antelopejs/interface-dms/auth";
import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import {
  notifyBackupCodeUsed,
  acceptTotpCode,
  consumeEmailCode,
  emailCodeMatches,
  isEmailCodeExpired,
} from "../../utils";
import type { ClientOrigin } from "../../utils";
import { recordSignIn } from "../../hooks";
import { authSchema, firstIssueMessage } from "../../validation";
import { answerTwoFactorChallenge } from "./two-factor-throttle";
import type { AuthResponse } from "./types";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

type VerifyMethod = "totp" | "email" | "backup";

interface VerifyMethodParams {
  user: Awaited<ReturnType<typeof validateTwoFactorToken>>["user"];
  code: string;
  userModel: UserModel;
}

const verifyMethods: Record<
  VerifyMethod,
  (params: VerifyMethodParams) => Promise<void>
> = {
  async totp({ user, code, userModel }) {
    assert(
      user.twoFactorMethods?.includes("totp"),
      401,
      "error.2fa_method_not_enabled",
    );
    assert(user.twoFactorSecret, 401, "error.2fa_not_configured");
    assert(
      await acceptTotpCode(userModel, user, user.twoFactorSecret, code),
      401,
      "error.invalid_2fa_code",
    );
  },

  async email({ user, code, userModel }) {
    assert(
      user.twoFactorMethods?.includes("email"),
      401,
      "error.2fa_method_not_enabled",
    );
    assert(user.twoFactorEmailCode, 401, "error.2fa_code_expired");
    assert(!isEmailCodeExpired(user), 401, "error.2fa_code_expired");
    assert(emailCodeMatches(user, code), 401, "error.invalid_2fa_code");

    consumeEmailCode(user);
    await userModel.update(user);
  },

  async backup({ user, code, userModel }) {
    assert(user.twoFactorBackupCodes?.length > 0, 401, "error.no_backup_codes");

    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    const matchIndex = user.twoFactorBackupCodes.indexOf(codeHash);
    assert(matchIndex >= 0, 401, "error.invalid_backup_code");

    user.twoFactorBackupCodes.splice(matchIndex, 1);
    await userModel.update(user);
  },
};

export async function verify2FA(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: Parameters<typeof authSchema.verify2FA.parse>[0],
  userAgent: string,
  origin: ClientOrigin,
): Promise<AuthResponse> {
  const { token, code, method } = assertValidation(
    body,
    (v) => authSchema.verify2FA.parse(v),
    firstIssueMessage,
  );

  const twoFactorPayload = await validateTwoFactorToken(token);
  const { user, tenantId } = twoFactorPayload;
  assert(tenantId, 401, "error.invalid_token");

  const verifier = verifyMethods[method];
  assert(verifier, 400, "error.invalid_2fa_method");
  await answerTwoFactorChallenge(user._id, token, () =>
    verifier({ user, code, userModel }),
  );
  if (method === "backup") {
    fireAndForget(
      notifyBackupCodeUsed(user._id, user.twoFactorBackupCodes?.length ?? 0),
      "backup code used notification",
    );
  }
  await recordSignIn(user, userAgent, origin);

  const sessionId = await createSession(
    sessionModel,
    user._id,
    userAgent,
    origin.ip,
  );

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
