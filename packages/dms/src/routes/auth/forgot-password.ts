import { GetModel } from "@antelopejs/interface-database-decorators";
import { sendEmailForgotEmail } from "@antelopejs/interface-dms/auth";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import randomstring from "randomstring";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { SignInAttemptsModel } from "../../db/models";
import { authSchema } from "../../validation";

const RATE_LIMIT_MS = 60 * 1000;

export async function forgotPassword(
  userModel: UserModel,
  body: ReturnType<typeof authSchema.forgot.parse>,
): Promise<void> {
  const { email } = body;
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
  await GetModel(SignInAttemptsModel).clearResetCodeAttempts(user._id);

  fireAndForget(
    sendEmailForgotEmail(user),
    `password reset email to "${user.email}"`,
  );
}
