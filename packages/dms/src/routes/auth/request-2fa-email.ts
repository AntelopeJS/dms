import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  send2FAEmail,
  validateTwoFactorToken,
} from "@antelopejs/interface-dms/auth";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  assertEmailCodeNotRateLimited,
  issueEmailCode,
} from "../../utils/two-factor-codes";
import { authSchema } from "../../validation/auth.schema";
import { assertTwoFactorChallengeOpen } from "./two-factor-throttle";

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

  await assertTwoFactorChallengeOpen(user._id, token);
  assertEmailCodeNotRateLimited(user);

  const code = issueEmailCode(user);
  await userModel.update(user);

  await send2FAEmail(user, code);

  return { success: true };
}
