import type { UserModel } from "./auth/db";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "./db/models/tenantMembers.model";
import { ExecuteHooks, Hook } from "./hooks";
import { runTenantLifecycleOperation } from "./tenant-lifecycle";
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

/** Admits membership writes before a tenant can begin destructive deletion. */
export async function applyTenantOwnership(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  patch: TenantMembershipPatch,
): Promise<void> {
  await runTenantLifecycleOperation(tenantId, async () => {
    // Public callers supplying a delivery identity still need the policy veto.
    // Internal resolution checks it before persisting its applying phase.
    if (
      patch.deliveryId &&
      !(await GetModel(TenantMemberModel, tenantId).getByUser(userId))
    ) {
      await ExecuteHooks(Hook.MEMBER_BEING_CHANGED, {
        tenantId,
        userId,
        isTenantOwner: patch.isTenantOwner,
        previousIsTenantOwner: null,
        deliveryId: patch.deliveryId,
      });
    }
    await applyAdmittedTenantOwnership(userModel, userId, tenantId, patch);
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
