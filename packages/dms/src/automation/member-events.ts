import { randomUUID } from "node:crypto";
import type { TenantMember } from "@antelopejs/interface-dms/db";
import type { MemberChangeOrigin, MemberRolesChangedEvent } from "./events";
import { emitOriginatedEvent } from "./loop-guard";

/** A membership's roles and owner flag, as read on one side of a write. */
export type MemberAccess = Pick<
  TenantMember,
  "userId" | "roleIds" | "isTenantOwner"
>;

/** One member's access before and after a completed write. */
export interface MemberAccessChange {
  before: MemberAccess;
  after: MemberAccess;
}

function memberRolesChanged(
  tenantId: string,
  { before, after }: MemberAccessChange,
  origin: MemberChangeOrigin,
  actorId: string | undefined,
): MemberRolesChangedEvent | undefined {
  const roleIds = [...(after.roleIds ?? [])];
  const previousRoleIds = [...(before.roleIds ?? [])];
  const addedRoleIds = roleIds.filter((id) => !previousRoleIds.includes(id));
  const removedRoleIds = previousRoleIds.filter((id) => !roleIds.includes(id));
  const isTenantOwner = after.isTenantOwner === true;
  const previousIsTenantOwner = before.isTenantOwner === true;
  if (
    addedRoleIds.length === 0 &&
    removedRoleIds.length === 0 &&
    isTenantOwner === previousIsTenantOwner
  )
    return undefined;
  const event: MemberRolesChangedEvent = {
    tenantId,
    userId: after.userId,
    roleIds,
    previousRoleIds,
    addedRoleIds,
    removedRoleIds,
    isTenantOwner,
    previousIsTenantOwner,
    origin,
    deliveryId: randomUUID(),
    at: new Date().toISOString(),
  };
  if (actorId && origin !== "automation") event.actorId = actorId;
  return event;
}

/**
 * Fires `dms.member-roles-changed` once per member whose roles or owner flag
 * a completed write changed, with both changes in one event. Call it after
 * the write: a refused or no-op write announces nothing.
 */
export function announceMemberChanges(
  tenantId: string,
  changes: readonly MemberAccessChange[],
  origin: MemberChangeOrigin,
  actorId?: string,
): void {
  for (const change of changes) {
    const event = memberRolesChanged(tenantId, change, origin, actorId);
    if (event)
      emitOriginatedEvent(
        "dms.member-roles-changed",
        `${tenantId}:${event.userId}`,
        event,
      );
  }
}
