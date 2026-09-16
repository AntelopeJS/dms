import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { getAuthConfig } from "../../config";
import { authSchema } from "../../validation/auth.schema";

export async function verifyEmail(
  userModel: UserModel,
  user: User,
  body: unknown,
): Promise<void> {
  const config = getAuthConfig();
  const { token } = assertValidation(body, (v) =>
    authSchema.verifyEmail.parse(v),
  );

  assert(config.mustValidateEmail, 400, "error.email_validation_disabled");

  assert(!user.isValidated, 400, "error.email_already_validated");
  assert(
    user.validationToken === token.toUpperCase(),
    400,
    "error.invalid_token",
  );
  assert(
    user.validationRequestedAt &&
      Date.now() - user.validationRequestedAt.getTime() <
        config.emailValidationTokenLifetime,
    400,
    "error.token_expired",
  );

  user.isValidated = true;
  user.validationToken = null;
  user.validationRequestedAt = null;

  await userModel.update(user);
}
