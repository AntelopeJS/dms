// The short numeric codes a user receives by email and types back. Only a
// hash of each is stored, so a database leak does not hand out live codes.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

const CODE_DIGITS = 6;
const CODE_RANGE = 10 ** CODE_DIGITS;

/** A fresh six-digit code. */
export function generateCode(): string {
  return randomInt(0, CODE_RANGE).toString().padStart(CODE_DIGITS, "0");
}

/**
 * Binds the code to its user: the same code sent to two accounts gives two
 * hashes.
 */
export function hashCode(userId: string, code: string): string {
  return createHash("sha256")
    .update(JSON.stringify([userId, code]))
    .digest("hex");
}

/** Constant-time comparison of two hashes. */
export function hashesMatch(left: string, right: string): boolean {
  const [a, b] = [Buffer.from(left), Buffer.from(right)];
  return a.length === b.length && timingSafeEqual(a, b);
}
