import { assert } from "@antelopejs/interface-api-util";
import { sendEmailValidationEmail } from "@antelopejs/interface-dms/auth";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";
import randomstring from "randomstring";
import { getAuthConfig } from "../../config";

const EMAIL_VERIFICATION_RATE_LIMIT_MS = 60 * 1000;

export async function requestEmailVerification(
  userModel: UserModel,
  user: User,
): Promise<void> {
  const config = getAuthConfig();
  assert(config.mustValidateEmail, 400, "error.email_validation_disabled");

  assert(!user.isValidated, 400, "error.email_already_validated");
  if (user.validationRequestedAt) {
    assert(
      Date.now() - user.validationRequestedAt.getTime() >
        EMAIL_VERIFICATION_RATE_LIMIT_MS,
      400,
      "error.email_already_requested",
    );
  }

  user.validationToken = randomstring.generate({
    length: 6,
    capitalization: "uppercase",
  });
  user.validationRequestedAt = new Date();

  await userModel.update(user);
  await sendEmailValidationEmail(user);
}
