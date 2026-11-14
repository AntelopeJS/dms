import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type Session,
  SessionModel,
  type User,
} from "@antelopejs/interface-dms/auth/db";

const SESSION_EXPIRED_ERROR = "error.session_expired";

/**
 * Read the session an access token claims, once its signature has checked
 * out, so a forged token never reaches the session query.
 *
 * @param sessionId The verified token's `sessionId` claim
 */
export async function loadTokenSession(
  sessionId: Session["_id"],
): Promise<Session | undefined> {
  return GetModel(SessionModel).get(sessionId);
}

/**
 * An access token lives only as long as its session: signing it out
 * (Settings › Security, logout) deletes the row, and the token stops working
 * at once instead of at its expiry. The row is the shared revocation state,
 * so every instance agrees.
 *
 * @param sessionId The verified token's `sessionId` claim
 * @param session The row {@link loadTokenSession} read for the claim
 * @param user The token's user
 * @throws Error when the session is gone or belongs to another user
 */
export function assertTokenSessionAlive(
  sessionId: string,
  session: Session | undefined,
  user: User,
): void {
  if (session?._id !== sessionId || session.userId !== String(user._id)) {
    throw new Error(SESSION_EXPIRED_ERROR);
  }
}
