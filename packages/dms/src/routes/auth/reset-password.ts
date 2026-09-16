import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import { getAuthConfig } from "../../config";
import { notifyPasswordReset } from "../../utils/account-notifications";
import { authSchema } from "../../validation/auth.schema";

export async function resetPassword(
  userModel: UserModel,
  body: unknown,
): Promise<void> {
  const config = getAuthConfig();
  const { email, token, password } = assertValidation(body, (v) =>
    authSchema.reset.parse(v),
  );

  const user = await userModel.getByEmail(email);
  const isTokenValid =
    user?.forgotPasswordToken === token &&
    user?.forgotPasswordRequestedAt &&
    Date.now() - user.forgotPasswordRequestedAt.getTime() <
      config.passwordRecoverTokenLifetime;

  assert(isTokenValid && user, 400, "error.invalid_or_expired_token");

  user.forgotPasswordToken = null;
  user.forgotPasswordRequestedAt = null;
  user.password = password;

  await userModel.update(user);

  void notifyPasswordReset(user._id);
}
