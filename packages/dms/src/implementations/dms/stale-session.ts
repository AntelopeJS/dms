import { assert } from "@antelopejs/interface-api-util";
import { isRejectedBearerToken } from "../dms-auth";
import type { PageResponsePayload } from "./page";

const HTTP_UNAUTHORIZED = 401;
const SESSION_EXPIRED_ERROR = "error.session_expired";

/**
 * A private page denied to a request whose bearer the DMS rejects is an expired
 * session, not a missing permission. Answering 401 lets the frontend server
 * refresh the session and retry, or send the visitor to the login page, where
 * the anonymous reading of that request would render a 403. A signed-in user
 * lacking the permission still gets the page payload with `hasAccess: false`.
 *
 * @throws HTTPResult(401) when the denial comes from a rejected bearer token
 */
export async function assertPageSessionAccepted(
  payload: PageResponsePayload,
  isAuthenticated: boolean,
  authorization: string | undefined,
): Promise<void> {
  const { route } = payload;
  if (isAuthenticated || route?.hasAccess !== false || route.publicAccess) {
    return;
  }
  const isRejected = await isRejectedBearerToken(authorization);
  assert(!isRejected, HTTP_UNAUTHORIZED, SESSION_EXPIRED_ERROR);
}
