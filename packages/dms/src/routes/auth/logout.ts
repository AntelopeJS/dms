import { HTTPResult } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { validateRefreshToken } from "@antelopejs/interface-dms/auth";
import type {
  SessionModel,
  User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { generateAuthKey } from "../../utils";
import { authSchema } from "../../validation";

export async function logout(
  userModel: UserModel,
  sessionModel: SessionModel,
  user: User,
  body: ReturnType<typeof authSchema.logout.parse>,
): Promise<HTTPResult> {
  const { token } = body;

  const data = await validateRefreshToken(token);
  assert(data.id === String(user._id), 401, "error.invalid_token");

  if (data.sessionId) {
    await sessionModel.delete(data.sessionId);
  } else {
    user.authKey = generateAuthKey();
    await userModel.update(user);
  }

  return new HTTPResult(204);
}
