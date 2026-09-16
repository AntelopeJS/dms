import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import { getAuthConfig } from "../../config";
import { authSchema } from "../../validation/auth.schema";

export async function validateForgotPasswordToken(
  userModel: UserModel,
  body: unknown,
): Promise<void> {
  const config = getAuthConfig();
  const { email, token } = assertValidation(body, (v) =>
    authSchema.validateForgotPasswordToken.parse(v),
  );

  const user = await userModel.getByEmail(email);
  const isTokenValid =
    user?.forgotPasswordToken === token &&
    user?.forgotPasswordRequestedAt &&
    Date.now() - user.forgotPasswordRequestedAt.getTime() <
      config.passwordRecoverTokenLifetime;

  assert(isTokenValid, 400, "error.invalid_or_expired_token");
}
