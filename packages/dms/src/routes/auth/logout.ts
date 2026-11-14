import { HTTPResult } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { validateRefreshToken } from "@antelopejs/interface-dms/auth";
import type { SessionModel, User } from "@antelopejs/interface-dms/auth/db";
import { authSchema } from "../../validation";

export async function logout(
  sessionModel: SessionModel,
  user: User,
  body: ReturnType<typeof authSchema.logout.parse>,
): Promise<HTTPResult> {
  const { token } = body;

  const data = await validateRefreshToken(token);
  assert(data.id === String(user._id), 401, "error.invalid_token");
  assert(data.sessionId, 401, "error.invalid_token");

  await sessionModel.delete(data.sessionId);

  return new HTTPResult(204);
}
