import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  send2FAEmail,
  validateTwoFactorToken,
} from "@antelopejs/interface-dms/auth";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import randomstring from "randomstring";
import { authSchema } from "../../validation/auth.schema";
import { TWO_FACTOR_RATE_LIMIT_MS } from "./constants";

type Request2FAEmailResult = { success: boolean };

export async function request2FAEmail(
  userModel: UserModel,
  body: unknown,
): Promise<Request2FAEmailResult> {
  const { token } = assertValidation(body, (v) =>
    authSchema.request2FAEmail.parse(v),
  );

  const { user } = await validateTwoFactorToken(token);

  assert(
    user.twoFactorMethods?.includes("email"),
    400,
    "error.2fa_email_not_enabled",
  );

  const isRateLimited =
    user.twoFactorEmailCodeRequestedAt &&
    Date.now() - new Date(user.twoFactorEmailCodeRequestedAt).getTime() <
      TWO_FACTOR_RATE_LIMIT_MS;
  assert(!isRateLimited, 429, "error.rate_limited");

  const code = randomstring.generate({
    length: 6,
    charset: "numeric",
  });

  user.twoFactorEmailCode = code;
  user.twoFactorEmailCodeRequestedAt = new Date();
  await userModel.update(user);

  await send2FAEmail(user, code);

  return { success: true };
}
