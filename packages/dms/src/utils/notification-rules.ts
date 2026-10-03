// Who receives the workspace notifications, and when two of them are one.
// Pure: the senders (workspace-notifications.ts) read the rows.

/** Saves of one role by one person this close together are one editing session. */
export const EDITING_SESSION_MS = 10 * 60 * 1000;

/**
 * Whether a save at `now` continues the session whose last save was at
 * `lastActivityAt`. The window slides: every save extends it.
 */
export function isWithinEditingSession(
  lastActivityAt: Date,
  now: Date,
): boolean {
  const elapsed = now.getTime() - new Date(lastActivityAt).getTime();
  return elapsed >= 0 && elapsed < EDITING_SESSION_MS;
}

/** The recipients without duplicates and without `excluded` (the actor, the subject). */
export function recipientsExcept(
  userIds: readonly string[],
  excluded: readonly (string | null | undefined)[],
): string[] {
  const skipped = new Set(excluded.filter(Boolean));
  return [...new Set(userIds)].filter((userId) => !skipped.has(userId));
}

/**
 * The owners told that someone joined. An inviter hears about it through
 * "your invitation was accepted" instead, so is left out here even when an
 * owner: nobody gets both notifications for one arrival.
 */
export function ownersToNotifyOfJoin(
  ownerIds: readonly string[],
  inviterIds: readonly string[],
  joinedUserId?: string,
): string[] {
  return recipientsExcept(ownerIds, [...inviterIds, joinedUserId]);
}

/** Whether two id lists hold the same ids, whatever their order. */
export function haveSameMembers(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((id) => rightSet.has(id))
  );
}
