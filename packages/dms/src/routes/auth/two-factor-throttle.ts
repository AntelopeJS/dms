import { createHash } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { SignInAttemptsModel } from "../../db/models/signInAttempts.model";
import { ATTEMPT_RETENTION_MS } from "../../utils/sign-in-monitor";

const HTTP_TOO_MANY_REQUESTS = 429;
const TOO_MANY_ATTEMPTS_MESSAGE = "error.too_many_2fa_attempts";
/**
 * Codes one two-factor challenge accepts, right or wrong. Past them the
 * challenge is spent and the password has to be given again for a new one.
 */
export const TWO_FACTOR_ATTEMPTS_PER_CHALLENGE = 5;

// The token is the challenge: each password sign-in issues a new one, so a
// new sign-in starts a fresh count. Only its hash is stored.
function challengeKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Counts one code tried against a two-factor challenge, before the code is
 * checked, and refuses it once the challenge used up its tries.
 *
 * @param userId The account signing in
 * @param token The two-factor token the challenge was issued as
 */
export async function claimTwoFactorAttempt(
  userId: string,
  token: string,
  now = new Date(),
): Promise<void> {
  const attempts = GetModel(SignInAttemptsModel);
  const count = await attempts.recordTwoFactorAttempt(
    userId,
    challengeKey(token),
    now,
  );
  await attempts.pruneBefore(
    userId,
    new Date(now.getTime() - ATTEMPT_RETENTION_MS),
  );
  assert(
    count <= TWO_FACTOR_ATTEMPTS_PER_CHALLENGE,
    HTTP_TOO_MANY_REQUESTS,
    TOO_MANY_ATTEMPTS_MESSAGE,
  );
}

/**
 * Refuses to act on a challenge that used up its tries, without counting a
 * new one: a spent challenge cannot ask for another emailed code either.
 */
export async function assertTwoFactorChallengeOpen(
  userId: string,
  token: string,
): Promise<void> {
  const count = await GetModel(SignInAttemptsModel).countTwoFactorAttempts(
    userId,
    challengeKey(token),
  );
  assert(
    count < TWO_FACTOR_ATTEMPTS_PER_CHALLENGE,
    HTTP_TOO_MANY_REQUESTS,
    TOO_MANY_ATTEMPTS_MESSAGE,
  );
}
