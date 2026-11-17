import { assert } from "@antelopejs/interface-api-util";
import { validateTwoFactorToken } from "@antelopejs/interface-dms/auth";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import { sendNewEmailCode } from "../../utils";
import { authSchema } from "../../validation";
import { assertTwoFactorChallengeOpen } from "./two-factor-throttle";

type Request2FAEmailResult = { success: boolean };

export async function request2FAEmail(
  userModel: UserModel,
  body: ReturnType<typeof authSchema.request2FAEmail.parse>,
): Promise<Request2FAEmailResult> {
  const { token } = body;

  const { user } = await validateTwoFactorToken(token);

  assert(
    user.twoFactorMethods?.includes("email"),
    400,
    "error.2fa_email_not_enabled",
  );

  await assertTwoFactorChallengeOpen(user._id, token);
  await sendNewEmailCode(userModel, user);

  return { success: true };
}
