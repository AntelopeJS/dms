import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { decode, sign, verify } from "jsonwebtoken";
import { generateSecret } from "./token-secret";

const HTTP_UNAUTHORIZED = 401;
const INVALID_HANDOFF_ERROR = "error.invalid_token";
const SESSION_HANDOFF_PURPOSE = "session-handoff";
const SESSION_HANDOFF_LIFETIME_SECONDS = 60;

/** What a session handoff token names: the session to hand back, and to whom. */
export interface SessionHandoffClaims {
  user: User;
  tenantId: string;
  sessionId: string;
}

interface SessionHandoffPayload {
  id?: unknown;
  tenantId?: unknown;
  sessionId?: unknown;
  purpose?: unknown;
}

/**
 * A short-lived token that hands one session a fresh token pair once the
 * user's `authKey` has been rotated under it. Signed with the new key, so it
 * dies with the next rotation; it only buys a pair when presented to
 * `/api/auth/session-handoff`.
 */
export function generateSessionHandoffToken(
  user: User,
  tenantId: string,
  sessionId: string,
): string {
  return sign(
    { id: user._id, tenantId, sessionId, purpose: SESSION_HANDOFF_PURPOSE },
    generateSecret(user.authKey),
    { expiresIn: SESSION_HANDOFF_LIFETIME_SECONDS },
  );
}

function refuse(): never {
  throw new HTTPResult(HTTP_UNAUTHORIZED, INVALID_HANDOFF_ERROR);
}

function readClaims(token: string, secret: string): SessionHandoffPayload {
  try {
    const payload = verify(token, secret, { algorithms: ["HS256"] });
    return typeof payload === "string"
      ? refuse()
      : (payload as SessionHandoffPayload);
  } catch {
    return refuse();
  }
}

/**
 * Checks a session handoff token against its user's current key.
 *
 * @throws HTTPResult(401) for any token that is not a live handoff
 */
export async function validateSessionHandoffToken(
  token: string,
): Promise<SessionHandoffClaims> {
  const unverified = decode(token) as SessionHandoffPayload | null;
  if (typeof unverified?.id !== "string") refuse();
  const user = await GetModel(UserModel).get(unverified.id);
  if (!user) refuse();
  const claims = readClaims(token, generateSecret(user.authKey));
  if (
    claims.purpose !== SESSION_HANDOFF_PURPOSE ||
    typeof claims.tenantId !== "string" ||
    typeof claims.sessionId !== "string"
  ) {
    refuse();
  }
  return { user, tenantId: claims.tenantId, sessionId: claims.sessionId };
}
