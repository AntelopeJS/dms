import { createHash } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import {
  SignInAttemptsModel,
  type TwoFactorTries,
} from "../../db/models/signInAttempts.model";
import { notifyTwoFactorLockout } from "../../utils/account-notifications";
import { ATTEMPT_RETENTION_MS } from "../../utils/sign-in-monitor";

const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const CHALLENGE_SPENT_MESSAGE = "error.too_many_2fa_attempts";
const ACCOUNT_LOCKED_MESSAGE = "error.too_many_2fa_attempts_account";
const CHALLENGE_USED_MESSAGE = "error.2fa_challenge_used";
const MS_PER_MINUTE = 60 * 1000;
/**
 * Codes one two-factor challenge accepts, right or wrong. Past them the
 * challenge is spent and the password has to be given again for a new one.
 */
export const TWO_FACTOR_ATTEMPTS_PER_CHALLENGE = 5;
/**
 * Wrong codes one account may take per window, across all its challenges:
 * signing in again with the password starts a new challenge, not a new count.
 */
export const TWO_FACTOR_ATTEMPTS_PER_ACCOUNT = 10;
/**
 * The window the account's wrong codes are counted over: an hour, longer than
 * the password throttle's, since whoever reaches this step knows the password.
 */
export const TWO_FACTOR_WINDOW_MS = 60 * MS_PER_MINUTE;

function challengeKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - TWO_FACTOR_WINDOW_MS);
}

function assertTriesLeft(tries: TwoFactorTries, pending: number): void {
  assert(
    tries.accountTries + pending <= TWO_FACTOR_ATTEMPTS_PER_ACCOUNT,
    HTTP_TOO_MANY_REQUESTS,
    ACCOUNT_LOCKED_MESSAGE,
  );
  assert(
    tries.challengeTries + pending <= TWO_FACTOR_ATTEMPTS_PER_CHALLENGE,
    HTTP_TOO_MANY_REQUESTS,
    CHALLENGE_SPENT_MESSAGE,
  );
}

async function assertChallengeOpen(
  userId: string,
  challenge: string,
  now: Date,
): Promise<void> {
  const attempts = GetModel(SignInAttemptsModel);
  const [isUsed, tries] = await Promise.all([
    attempts.isTwoFactorChallengeUsed(challenge),
    attempts.countTwoFactorAttempts(userId, challenge, windowStart(now)),
  ]);
  assert(!isUsed, HTTP_UNAUTHORIZED, CHALLENGE_USED_MESSAGE);
  assertTriesLeft(tries, 1);
}

async function claimAttempt(
  userId: string,
  challenge: string,
  now: Date,
): Promise<TwoFactorTries> {
  await assertChallengeOpen(userId, challenge, now);
  const attempts = GetModel(SignInAttemptsModel);
  const tries = await attempts.recordTwoFactorAttempt(
    userId,
    challenge,
    windowStart(now),
    now,
  );
  await attempts.pruneBefore(
    userId,
    new Date(now.getTime() - ATTEMPT_RETENTION_MS),
  );
  assertTriesLeft(tries, 0);
  return tries;
}

async function closeChallenge(
  userId: string,
  challenge: string,
  now: Date,
): Promise<void> {
  const attempts = GetModel(SignInAttemptsModel);
  const isClaimed = await attempts.claimTwoFactorChallenge(
    userId,
    challenge,
    now,
  );
  assert(isClaimed, HTTP_UNAUTHORIZED, CHALLENGE_USED_MESSAGE);
  await attempts.clearTwoFactorAttempts(userId);
}

async function warnOfLockout(userId: string, now: Date): Promise<void> {
  const oldest = await GetModel(SignInAttemptsModel).oldestTwoFactorAttempt(
    userId,
    windowStart(now),
  );
  if (oldest === undefined) return;
  await notifyTwoFactorLockout(
    userId,
    {
      count: TWO_FACTOR_ATTEMPTS_PER_ACCOUNT,
      windowMinutes: TWO_FACTOR_WINDOW_MS / MS_PER_MINUTE,
    },
    oldest,
  );
}

/**
 * Answers a two-factor challenge with one code: the only way a code is tried.
 * The code is refused without being checked once the challenge used up its
 * tries, the account its wrong codes for the window, or the challenge already
 * opened a session. A right code spends the challenge, so it opens one
 * session, and clears the account's count; the wrong code that fills the
 * account's window warns its owner.
 *
 * @param userId The account signing in
 * @param token The two-factor token the challenge was issued as
 * @param checkCode Throws when the code is wrong
 */
export async function answerTwoFactorChallenge(
  userId: string,
  token: string,
  checkCode: () => Promise<void>,
  now = new Date(),
): Promise<void> {
  const challenge = challengeKey(token);
  const tries = await claimAttempt(userId, challenge, now);
  try {
    await checkCode();
  } catch (error) {
    if (tries.accountTries >= TWO_FACTOR_ATTEMPTS_PER_ACCOUNT) {
      fireAndForget(
        warnOfLockout(userId, now),
        "two-factor lockout notification",
      );
    }
    throw error;
  }
  await closeChallenge(userId, challenge, now);
}

/**
 * Refuses to act on a closed challenge, without counting a try: a closed
 * challenge cannot ask for another emailed code either.
 */
export async function assertTwoFactorChallengeOpen(
  userId: string,
  token: string,
): Promise<void> {
  await assertChallengeOpen(userId, challengeKey(token), new Date());
}
