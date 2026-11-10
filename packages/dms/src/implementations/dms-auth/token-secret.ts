import { createSecretKey, type KeyObject } from "node:crypto";
import { getAuthConfig } from "../../config";

const SECRET_VERSION = 1;

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
