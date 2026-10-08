import { assertValidation } from "@antelopejs/interface-api-util";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import { authSchema } from "../../validation/auth.schema";
import { assertResetCode } from "./reset-code";

export async function validateForgotPasswordToken(
  userModel: UserModel,
  body: unknown,
): Promise<void> {
  const { email, token } = assertValidation(body, (v) =>
    authSchema.validateForgotPasswordToken.parse(v),
  );
  await assertResetCode(userModel, email, token);
}
