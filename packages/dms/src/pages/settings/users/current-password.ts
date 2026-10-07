import { assert } from "@antelopejs/interface-api-util";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";

const HTTP_BAD_REQUEST = 400;
// 400, not 401: the dashboard treats a 401 as an expired session and signs out.
const INVALID_CURRENT_PASSWORD = "error.invalid_current_password";

/**
 * Proves the caller knows the account password. The stored row is re-read:
 * the guard's copy may predate a change made by another session.
 *
 * @param userModel Model the account is read from
 * @param user The signed-in user
 * @param password Password typed by the user
 */
export async function assertCurrentPassword(
  userModel: UserModel,
  user: User,
  password: string | undefined,
): Promise<void> {
  const stored = await userModel.get(user._id);
  assert(stored?.password, HTTP_BAD_REQUEST, "error.password_not_set");
  assert(
    !!password && stored.testHash("password", password),
    HTTP_BAD_REQUEST,
    INVALID_CURRENT_PASSWORD,
  );
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
