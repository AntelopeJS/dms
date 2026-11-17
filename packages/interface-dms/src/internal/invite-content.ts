import { isDeepStrictEqual } from "node:util";
import type { UserInvite } from "../db/tables/user_invites.table";

/**
 * The invitation's content as plain data.
 *
 * `roles_ids` and `extensions` reach this comparison as per-context views when
 * the caller lives in another module, and `isDeepStrictEqual` refuses two views
 * holding the same values, which would report a faithful retry as a conflict.
 */
function inviteContent(invite: UserInvite | null | undefined): string | null {
  if (!invite) return null;
  return JSON.stringify([
    invite.email,
    invite.firstname,
    invite.lastname,
    invite.language,
    invite.roles_ids,
    invite.asTenantOwner,
    invite.extensions,
  ]);
}

/**
 * Whether two invitations carry the same content, ignoring their id, token
 * and dates.
 *
 * @internal
 */
export function isSameInviteContent(
  left: UserInvite | null | undefined,
  right: UserInvite | null | undefined,
): boolean {
  const leftContent = inviteContent(left);
  const rightContent = inviteContent(right);
  return isDeepStrictEqual(
    leftContent === null ? null : JSON.parse(leftContent),
    rightContent === null ? null : JSON.parse(rightContent),
  );
}
