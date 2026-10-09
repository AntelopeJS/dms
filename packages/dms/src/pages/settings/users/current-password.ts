import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { SignInAttemptsModel } from "../../../db/models/signInAttempts.model";
import {
  FAILURES_PER_ACCOUNT,
  LOGIN_WINDOW_MS,
} from "../../../routes/auth/login-throttle";
import { ATTEMPT_RETENTION_MS } from "../../../utils/sign-in-monitor";

const HTTP_BAD_REQUEST = 400;
const HTTP_TOO_MANY_REQUESTS = 429;
// 400, not 401: the dashboard treats a 401 as an expired session and signs out.
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";
const TOO_MANY_ATTEMPTS = "error.too_many_current_password_attempts";

// Whether `tries` leaves room for `pending` more: one before a try is
// recorded, none once it counts itself.
function assertTriesLeft(tries: number, pending: number): void {
  assert(
    tries + pending <= FAILURES_PER_ACCOUNT,
    HTTP_TOO_MANY_REQUESTS,
    TOO_MANY_ATTEMPTS,
  );
}

// The sign-in form's budget, so a borrowed session guesses the password no
// faster than the sign-in form allows. Counted before the password is
// compared, so concurrent tries on several instances share one budget. A
// refused try is not counted: the window passes for a user who keeps trying.
async function claimAttempt(userId: string, now: Date): Promise<void> {
  const attempts = GetModel(SignInAttemptsModel);
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const triesSoFar = await attempts.countCurrentPasswordAttempts(userId, since);
  assertTriesLeft(triesSoFar, 1);
  const tries = await attempts.recordCurrentPasswordAttempt(userId, since, now);
  await attempts.pruneBefore(
    userId,
    new Date(now.getTime() - ATTEMPT_RETENTION_MS),
  );
  assertTriesLeft(tries, 0);
}

/**
 * Proves the caller knows the account password. The stored row is re-read:
 * the guard's copy may predate a change made by another session. Every check
 * counts against the account: past the sign-in form's number of tries within
 * its window, every check is refused with 429, the right password included,
 * and the right password forgets the count.
 *
 * @param userModel Model the account is read from
 * @param user The signed-in user
 * @param password Password typed by the user
 */
export async function assertCurrentPassword(
  userModel: UserModel,
  user: User,
  password: string | undefined,
  now = new Date(),
): Promise<void> {
  const stored = await userModel.get(user._id);
  assert(stored?.password, HTTP_BAD_REQUEST, "error.password_not_set");
  assert(password, HTTP_BAD_REQUEST, INVALID_CURRENT_PASSWORD);
  await claimAttempt(stored._id, now);
  assert(
    stored.testHash("password", password),
    HTTP_BAD_REQUEST,
    INVALID_CURRENT_PASSWORD,
  );
  await GetModel(SignInAttemptsModel).clearCurrentPasswordAttempts(stored._id);
}

/**
 * {@link assertCurrentPassword}, skipped for an account without a password
 * (single sign-on only): there is nothing to verify against.
 */
export async function assertCurrentPasswordIfSet(
  userModel: UserModel,
  user: User,
  password: string | undefined,
): Promise<void> {
  const stored = await userModel.get(user._id);
  if (!stored?.password) return;
  await assertCurrentPassword(userModel, user, password);
}
