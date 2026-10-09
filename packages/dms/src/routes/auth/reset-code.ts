import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { getAuthConfig } from "../../config";
import { SignInAttemptsModel } from "../../db/models/signInAttempts.model";

const HTTP_BAD_REQUEST = 400;
const INVALID_CODE_MESSAGE = "error.invalid_or_expired_token";
/** Tries one reset code may take; the last wrong one withdraws it. */
export const MAX_RESET_CODE_ATTEMPTS = 5;

interface UserWithResetCode extends User {
  forgotPasswordToken: string;
  forgotPasswordRequestedAt: Date;
}

function hasLiveResetCode(
  user: User | undefined,
  now: number,
): user is UserWithResetCode {
  return (
    !!user?.forgotPasswordToken &&
    !!user.forgotPasswordRequestedAt &&
    now - user.forgotPasswordRequestedAt.getTime() <
      getAuthConfig().passwordRecoverTokenLifetime
  );
}

// Codes are generated in capitals: one typed in lowercase is the same code.
function normalizeResetCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Checks the password-reset code sent to `email`. Every try is counted in the
 * database before the code is compared, and a code that took
 * {@link MAX_RESET_CODE_ATTEMPTS} tries without a match is withdrawn: a new
 * one must be requested. An unknown address and a wrong, expired or withdrawn
 * code get the same refusal, so it tells nothing of which accounts exist.
 *
 * @param userModel Model the account is read from and the code withdrawn in
 * @param email The address the code was requested for
 * @param code The code as typed
 * @returns The account the code belongs to
 */
export async function assertResetCode(
  userModel: UserModel,
  email: string,
  code: string,
): Promise<User> {
  const user = await userModel.getByEmail(email);
  assert(
    hasLiveResetCode(user, Date.now()),
    HTTP_BAD_REQUEST,
    INVALID_CODE_MESSAGE,
  );
  const attempts = GetModel(SignInAttemptsModel);
  const tries = await attempts.recordResetCodeAttempt(
    user._id,
    user.forgotPasswordRequestedAt,
    new Date(),
  );
  const isMatch =
    tries <= MAX_RESET_CODE_ATTEMPTS &&
    normalizeResetCode(code) === user.forgotPasswordToken;
  if (!isMatch && tries >= MAX_RESET_CODE_ATTEMPTS) {
    // Saved whole, like every write of an account: a partial update rewrites
    // the hashed fields' stored state and loses the password.
    const account: User = user;
    account.forgotPasswordToken = null;
    await userModel.update(account);
  }
  assert(isMatch, HTTP_BAD_REQUEST, INVALID_CODE_MESSAGE);
  await attempts.clearResetCodeAttempts(user._id);
  return user;
}
