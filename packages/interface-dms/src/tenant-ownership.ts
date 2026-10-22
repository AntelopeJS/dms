import type { UserModel } from "./auth/db";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "./db/models/tenantMembers.model";
import { changeTenantMembers } from "./tenant-members";
import { describeMembershipPatch } from "./internal/member-changes";
import {
  applyAdmittedTenantOwnership,
  mirrorPlatformOwner,
} from "./internal/tenant-ownership";

export interface TenantMembershipPatch {
  roleIds: string[];
  isTenantOwner: boolean;
  invitedBy?: string | null;
  /** Durable invite delivery; grants membership without replacing later edits. */
  deliveryId?: string;
}

/**
 * Adds the user to the tenant, or sets the roles and ownership of an existing
 * member, through `changeTenantMembers`.
 */
export async function applyTenantOwnership(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  patch: TenantMembershipPatch,
): Promise<void> {
  await changeTenantMembers(tenantId, async () => {
    const existing = await GetModel(TenantMemberModel, tenantId).getByUser(
      userId,
    );
    return {
      changes: describeMembershipPatch(existing, userId, patch),
      write: () =>
        applyAdmittedTenantOwnership(userModel, userId, tenantId, patch),
    };
  });
}

export async function syncPlatformOwnerOnTenantOwnerChange(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  nextIsTenantOwner: boolean,
): Promise<void> {
  await mirrorPlatformOwner(userModel, userId, tenantId, nextIsTenantOwner);
}

export async function clearPlatformOwnerOnMemberRemoval(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  removedMemberWasTenantOwner: boolean,
): Promise<void> {
  if (!removedMemberWasTenantOwner) return;
  await mirrorPlatformOwner(userModel, userId, tenantId, false);
}
