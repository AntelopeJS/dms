import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  createSession,
  generateAccessToken,
} from "@antelopejs/interface-dms/auth";
import { SessionModel, type User } from "@antelopejs/interface-dms/auth/db";

/** An access token for `user` in `tenantId`, bound to a session opened for it. */
export async function sessionAccessToken(
  tenantId: string,
  user: User,
): Promise<string> {
  const sessionId = await createSession(
    GetModel(SessionModel),
    user._id,
    "",
    "",
  );
  return (await generateAccessToken(tenantId, user, sessionId)).token;
}
