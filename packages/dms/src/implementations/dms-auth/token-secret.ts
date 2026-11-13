import { createSecretKey, type KeyObject } from "node:crypto";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { type JwtPayload, verify } from "jsonwebtoken";
import { getAuthConfig } from "../../config";

const SECRET_VERSION = 1;
const UNKNOWN_USER_AUTH_KEY = "unknown-user";

/**
 * The secret a user's tokens are signed with: the instance secret mixed with
 * the user's `authKey`, so rotating the key invalidates every token issued
 * before.
 */
export function generateSecret(authKey: string): KeyObject {
  return createSecretKey(
    `${SECRET_VERSION}:${authKey}:${getAuthConfig().jwtSecret}`,
    "utf8",
  );
}

/**
 * The payload of `token` once it is proven signed for `user`, or `null`.
 * When no user matched the token's claimed id, the token is still verified,
 * against a fixed key no token is signed with, so refusing an unknown id
 * takes the same work as refusing a forged signature.
 *
 * @param token The token as the client sent it
 * @param user The user its unverified `id` claim names, when one exists
 */
export function verifyTokenFor(
  token: string,
  user: User | undefined,
): string | JwtPayload | null {
  const secret = generateSecret(user?.authKey ?? UNKNOWN_USER_AUTH_KEY);
  try {
    const payload = verify(token, secret, { algorithms: ["HS256"] });
    return user ? payload : null;
  } catch {
    return null;
  }
}
