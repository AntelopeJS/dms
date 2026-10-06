import { getAuthConfig } from "../../config";

const SECRET_VERSION = 1;

/**
 * The secret a user's tokens are signed with: the instance secret mixed with
 * the user's `authKey`, so rotating the key invalidates every token issued
 * before.
 */
export function generateSecret(authKey: string): string {
  return `${SECRET_VERSION}:${authKey}:${getAuthConfig().jwtSecret}`;
}
