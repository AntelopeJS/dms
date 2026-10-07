import { createHash, timingSafeEqual } from "node:crypto";
import type { Session } from "../tables/sessions.table";

/** @internal */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** @internal */
export function hashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

/** @internal */
export const REFRESH_TOKEN_PREDECESSOR_GRACE_MS = 15_000;

/** @internal */
export function isImmediateRefreshTokenPredecessor(
  session: Session,
  presentedToken: string,
  now: Date,
): boolean {
  if (!session.previousRefreshTokenHash || !session.refreshTokenRotatedAt) {
    return false;
  }
  const age = now.getTime() - session.refreshTokenRotatedAt.getTime();
  if (Math.abs(age) > REFRESH_TOKEN_PREDECESSOR_GRACE_MS) return false;
  return hashesMatch(
    session.previousRefreshTokenHash,
    hashRefreshToken(presentedToken),
  );
}
