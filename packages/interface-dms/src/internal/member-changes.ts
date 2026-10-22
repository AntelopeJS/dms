import type { TenantMember } from "../db/tables/tenantMembers.table";
import type { MemberChange, MemberRemovedChange } from "../hooks";
import type { TenantMembershipPatch } from "../tenant-ownership";

/** The membership fields an edit may set; a field left out keeps its value. */
export interface MemberEdit {
  roleIds?: string[];
  isTenantOwner?: boolean;
}

function haveSameRoles(left: string[], right: string[]): boolean {
  const rightIds = new Set(right);
  return (
    new Set(left).size === rightIds.size && left.every((id) => rightIds.has(id))
  );
}

/**
 * What an edit of an existing membership changes: nothing, its ownership, its
 * roles, or both.
 *
 * @internal
 */
export function describeMemberEdit(
  member: TenantMember,
  edit: MemberEdit,
): MemberChange[] {
  const changes: MemberChange[] = [];
  const previousIsTenantOwner = member.isTenantOwner === true;
  if (
    edit.isTenantOwner !== undefined &&
    edit.isTenantOwner !== previousIsTenantOwner
  ) {
    changes.push({
      kind: "ownership",
      userId: member.userId,
      isTenantOwner: edit.isTenantOwner,
      previousIsTenantOwner,
    });
  }
  const previousRoleIds = [...(member.roleIds ?? [])];
  if (edit.roleIds && !haveSameRoles(edit.roleIds, previousRoleIds)) {
    changes.push({
      kind: "roles",
      userId: member.userId,
      roleIds: [...edit.roleIds],
      previousRoleIds,
    });
  }
  return changes;
}

/**
 * What granting `patch` changes. A delivery never replaces an existing
 * membership, so it changes nothing once the user is a member.
 *
 * @internal
 */
export function describeMembershipPatch(
  existing: TenantMember | undefined,
  userId: string,
  patch: TenantMembershipPatch,
): MemberChange[] {
  if (existing)
    return patch.deliveryId ? [] : describeMemberEdit(existing, patch);
  const added: MemberChange = {
    kind: "added",
    userId,
    isTenantOwner: patch.isTenantOwner,
    roleIds: [...patch.roleIds],
  };
  if (patch.deliveryId) added.deliveryId = patch.deliveryId;
  return [added];
}

/** @internal */
export function describeMemberRemoval(
  member: TenantMember,
): MemberRemovedChange {
  return {
    kind: "removed",
    userId: member.userId,
    isTenantOwner: member.isTenantOwner === true,
  };
}
