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
 * Record that `user` just used the dashboard. It writes `lastActiveAt` alone,
 * so a request need not wait for it: whichever lands last, it never puts back
 * a field the request changed (a rotated `authKey`, a new password).
 *
 * @param userModel Model the user row is written through
 * @param user The authenticated user, updated in place when a write is due
 * @param now When the request is handled
 */
export async function recordUserActivity(
  userModel: UserModel,
  user: User,
  now: Date = new Date(),
): Promise<void> {
  if (!isActivityWriteDue(user.lastActiveAt, now)) return;
  user.lastActiveAt = now;

  await userModel.update(user._id, { lastActiveAt: now });
}
