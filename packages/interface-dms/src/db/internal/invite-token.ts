import { createHash } from "node:crypto";

/**
 * The digest an invitation stores in place of its token, and the key a
 * link's token is looked up by.
 *
 * @internal
 */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
