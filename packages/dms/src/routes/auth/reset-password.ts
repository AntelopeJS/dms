import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { revokeAllSessions } from "../../pages/account";
import { notifyPasswordReset } from "../../utils";
import { authSchema } from "../../validation";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { assertResetCode } from "./reset-code";

/**
 * Sets a new password once the emailed reset code is proven, and signs out
 * every session: whoever had access to the account loses it at once.
 */
export async function resetPassword(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: ReturnType<typeof authSchema.reset.parse>,
): Promise<void> {
  const { email, token, password } = body;
  const user = await assertResetCode(userModel, email, token);

  user.forgotPasswordToken = null;
  user.forgotPasswordRequestedAt = null;
  user.password = password;
  user.passwordChangedAt = new Date();
  await revokeAllSessions(user, sessionModel, userModel);

  fireAndForget(
    notifyPasswordReset(user._id, user.email),
    "password reset notification",
  );
}
