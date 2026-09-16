import { assertValidation } from "@antelopejs/interface-api-util";
import { sendEmailForgotEmail } from "@antelopejs/interface-dms/auth";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import randomstring from "randomstring";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { authSchema } from "../../validation/auth.schema";

const RATE_LIMIT_MS = 60 * 1000;

export async function forgotPassword(
  userModel: UserModel,
  body: unknown,
): Promise<void> {
  const { email } = assertValidation(body, (v) => authSchema.forgot.parse(v));
  const user = await userModel.getByEmail(email);

  if (!user) {
    return;
  }

  if (user.forgotPasswordRequestedAt) {
    const timeSinceLastRequest =
      Date.now() - user.forgotPasswordRequestedAt.getTime();
    if (timeSinceLastRequest < RATE_LIMIT_MS) {
      return;
    }
  }

  user.forgotPasswordToken = randomstring.generate({
    length: 6,
    capitalization: "uppercase",
  });
  user.forgotPasswordRequestedAt = new Date();

  await userModel.update(user);

  fireAndForget(
    sendEmailForgotEmail(user),
    `password reset email to "${user.email}"`,
  );
}
