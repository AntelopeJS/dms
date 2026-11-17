import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import { authSchema } from "../../validation";
import { assertResetCode } from "./reset-code";

export async function validateForgotPasswordToken(
  userModel: UserModel,
  body: ReturnType<typeof authSchema.validateForgotPasswordToken.parse>,
): Promise<void> {
  const { email, token } = body;
  await assertResetCode(userModel, email, token);
}
