// Checks of the codes a second factor produces, shared by the sign-in step and
// the Security page so both accept a code under the same rules: an emailed
// code is stored hashed and expires, an authenticator code works once.

import { assert } from "@antelopejs/interface-api-util";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { generateCode as generateTotpCode } from "2fa";
import {
  TWO_FACTOR_EMAIL_CODE_LIFETIME_MS,
  TWO_FACTOR_RATE_LIMIT_MS,
} from "../routes/auth/constants";
import { generateCode, hashCode, hashesMatch } from "./one-time-code";

export type TwoFactorMethod = "totp" | "email";

const HTTP_TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;
/** Lifetime of an authenticator code, as the `2fa` package counts it. */
const TOTP_STEP_SECONDS = 30;
/** Below any real step: an account that never had a code accepted. */
const NO_ACCEPTED_STEP = -1;

const msSince = (date: Date | null | undefined, now: number): number =>
  date ? now - new Date(date).getTime() : Number.POSITIVE_INFINITY;

/** Refuses a new emailed code within a minute of the previous one. */
export function assertEmailCodeNotRateLimited(
  user: User,
  now = Date.now(),
): void {
  const isRateLimited =
    msSince(user.twoFactorEmailCodeRequestedAt, now) < TWO_FACTOR_RATE_LIMIT_MS;
  assert(!isRateLimited, HTTP_TOO_MANY_REQUESTS, "error.rate_limited");
}

/**
 * Replaces the user's emailed code; the caller saves the user and sends the
 * returned code, which is never stored in clear.
 *
 * @returns The code to email
 */
export function issueEmailCode(user: User, now = Date.now()): string {
  const code = generateCode();
  user.twoFactorEmailCode = hashCode(user._id, code);
  user.twoFactorEmailCodeRequestedAt = new Date(now);
  return code;
}

export function isEmailCodeExpired(user: User, now = Date.now()): boolean {
  return (
    msSince(user.twoFactorEmailCodeRequestedAt, now) >
    TWO_FACTOR_EMAIL_CODE_LIFETIME_MS
  );
}

/** Whether `code` is the one last emailed, compared in constant time. */
export function emailCodeMatches(user: User, code: string): boolean {
  return (
    !!user.twoFactorEmailCode &&
    hashesMatch(user.twoFactorEmailCode, hashCode(user._id, code))
  );
}

/** Forgets the emailed code once used; the caller saves the user. */
export function consumeEmailCode(user: User): void {
  user.twoFactorEmailCode = null;
  user.twoFactorEmailCodeRequestedAt = null;
}

/** The time step an authenticator app shows a code for at `now`. */
export function totpStepAt(now: number): number {
  return Math.floor(now / MS_PER_SECOND / TOTP_STEP_SECONDS);
}

/**
 * Accepts an authenticator code at most once: its time step must be later
 * than the last one accepted. The step is claimed by one conditional update,
 * so two requests racing with the same code, on any instance, cannot both
 * pass.
 *
 * @param secret The key the code must come from: the enrolled one, or the
 *   pending one while the app is being set up
 * @returns Whether the code was accepted
 */
export async function acceptTotpCode(
  userModel: UserModel,
  user: User,
  secret: string,
  code: string,
  now = Date.now(),
): Promise<boolean> {
  // Same window as `verifyTOTP`: the current step only, no drift.
  const step = totpStepAt(now);
  if (generateTotpCode(secret, step) !== code) return false;
  const claimed = await userModel.table
    .getAll(user._id)
    .filter((row) =>
      row.key("twoFactorTotpLastStep").default(NO_ACCEPTED_STEP).lt(step),
    )
    .update({ twoFactorTotpLastStep: step })
    .run();
  if (claimed === 0) return false;
  user.twoFactorTotpLastStep = step;
  return true;
}

const CODE_VERIFIERS: Record<
  TwoFactorMethod,
  (userModel: UserModel, user: User, code: string) => Promise<boolean>
> = {
  totp: async (userModel, user, code) =>
    !!user.twoFactorSecret &&
    (await acceptTotpCode(userModel, user, user.twoFactorSecret, code)),
  email: async (_userModel, user, code) => {
    if (isEmailCodeExpired(user) || !emailCodeMatches(user, code)) {
      return false;
    }
    consumeEmailCode(user);
    return true;
  },
};

/**
 * Checks a code from one of the user's methods. A code that passes is used
 * up: an authenticator step is recorded at once, an emailed code is cleared
 * on the user, which the caller saves.
 */
export function verifyTwoFactorCode(
  userModel: UserModel,
  user: User,
  method: TwoFactorMethod,
  code: string,
): Promise<boolean> {
  return CODE_VERIFIERS[method](userModel, user, code);
}
