import { assertValidation } from "@antelopejs/interface-api-util";
import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { revokeAllSessions } from "../../pages/settings/users/account-credentials";
import { notifyPasswordReset } from "../../utils/account-notifications";
import { authSchema } from "../../validation/auth.schema";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { assertResetCode } from "./reset-code";

/**
 * Sets a new password once the emailed reset code is proven, and signs out
 * every session: whoever had access to the account loses it at once.
 */
export async function resetPassword(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: unknown,
): Promise<void> {
  const { email, token, password } = assertValidation(body, (v) =>
    authSchema.reset.parse(v),
  );
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
