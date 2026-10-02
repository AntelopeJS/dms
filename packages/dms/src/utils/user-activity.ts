import { Logging } from "@antelopejs/interface-core/logging";
import type { User, UserModel } from "@antelopejs/interface-dms/auth/db";

/**
 * Minimum time between two writes of a user's `lastActiveAt`. Every
 * authenticated request reaches the recorder, so without a floor a busy page
 * would write the user row several times a second.
 */
export const USER_ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000;

/**
 * Whether a request made at `now` should move `lastActiveAt` forward.
 *
 * @param lastActiveAt The value currently stored, if any
 * @param now When the request is handled
 */
export function isActivityWriteDue(
  lastActiveAt: Date | null | undefined,
  now: Date,
): boolean {
  if (!lastActiveAt) return true;
  const elapsed = now.getTime() - new Date(lastActiveAt).getTime();
  return elapsed >= USER_ACTIVITY_WRITE_INTERVAL_MS;
}

/**
 * Record that `user` just used the dashboard. The write is not awaited: a
 * request must not fail, nor wait, because its activity could not be stored.
 *
 * @param userModel Model the user row is written through
 * @param user The authenticated user, updated in place when a write is due
 * @param now When the request is handled
 */
export function recordUserActivity(
  userModel: UserModel,
  user: User,
  now: Date = new Date(),
): void {
  if (!isActivityWriteDue(user.lastActiveAt, now)) return;
  user.lastActiveAt = now;
  // Through the whole row, like every other user write: a partial update
  // resets the hashed fields' modifier storage and wipes the password.
  userModel.update(user).catch((error: unknown) => {
    Logging.Warn(`[dms] could not record the activity of "${user._id}"`, error);
  });
}
