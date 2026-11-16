import { ValueProxy } from "@antelopejs/interface-database";
import type {
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";

/** The members of `model`'s instance holding `roleId`, in stored order. */
export function membersHoldingRole(model: TenantMemberModel, roleId: string) {
  return model.table.filter((row) => row.key("roleIds", []).includes(roleId));
}

/** The invitations of `model`'s instance granting `roleId`, expired or not. */
export function invitesGrantingRole(model: UserInviteModel, roleId: string) {
  return model.table.filter((row) => row.key("roles_ids", []).includes(roleId));
}

/** The invitations granting `roleId` that can still be accepted at `now`. */
export function pendingInvitesGrantingRole(
  model: UserInviteModel,
  roleId: string,
  now: Date,
) {
  return model.table.filter((row) =>
    row.key("roles_ids", []).includes(roleId).and(row.key("expiresAt").gt(now)),
  );
}

/** Number of members and pending invitations holding `roleId` at `now`. */
export async function countRoleHolders(
  members: TenantMemberModel,
  invites: UserInviteModel,
  roleId: string,
  now: Date,
): Promise<number> {
  const [memberCount, inviteCount] = await Promise.all([
    membersHoldingRole(members, roleId).count().run(),
    pendingInvitesGrantingRole(invites, roleId, now).count().run(),
  ]);
  return memberCount + inviteCount;
}

/**
 * The users holding any of `roleIds` in `model`'s instance, each once. With a
 * model read across instances, a user who holds them in several tenants counts once.
 */
export async function userIdsHoldingAnyRole(
  model: TenantMemberModel,
  roleIds: string[],
): Promise<string[]> {
  if (roleIds.length === 0) return [];
  return model.table
    .filter((row) =>
      row
        .key("roleIds", [])
        .filter((roleId) => ValueProxy.constant(roleIds).includes(roleId))
        .isempty()
        .not(),
    )
    .distinct("userId")
    .run();
}
