import { GetModel } from "@antelopejs/interface-database-decorators";
import type { UserModel } from "./auth/db";
import { isSaasMode } from "./utils/saas-mode";
import { DEFAULT_TENANT_ID } from "./constants";
import { TenantMemberModel } from "./db/models/tenantMembers.model";
import type { TenantMember } from "./db/tables/tenantMembers.table";
import { ExecuteHooks, Hook } from "./hooks";
import { runTenantLifecycleOperation } from "./tenant-lifecycle";

export interface TenantMembershipPatch {
  roleIds: string[];
  isTenantOwner: boolean;
  invitedBy?: string | null;
  /** Durable invite delivery; grants membership without replacing later edits. */
  deliveryId?: string;
}

function buildTenantMemberId(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

async function upsertTenantMembership(
  userId: string,
  tenantId: string,
  patch: TenantMembershipPatch,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const existing = await memberModel.getByUser(userId);
  if (existing) {
    if (patch.deliveryId) return;
    existing.roleIds = patch.roleIds;
    existing.isTenantOwner = patch.isTenantOwner;
    await memberModel.update(existing);
    return;
  }
  try {
    const member: TenantMember = {
      _id: buildTenantMemberId(tenantId, userId),
      userId,
      roleIds: patch.roleIds,
      isTenantOwner: patch.isTenantOwner,
      joinedAt: new Date(),
      invitedBy: patch.invitedBy ?? null,
    };
    if (patch.deliveryId) member.inviteDeliveryId = patch.deliveryId;
    await memberModel.insert(member);
  } catch (insertError) {
    const recheck = await memberModel.getByUser(userId);
    if (!recheck) throw insertError;
    if (patch.deliveryId) return;
    recheck.roleIds = patch.roleIds;
    recheck.isTenantOwner = patch.isTenantOwner;
    await memberModel.update(recheck);
  }
}

/**
 * Compatibility shim: in non-SaaS mode, the legacy `users.owner` boolean is
 * kept in sync with `TenantMember.isTenantOwner` on the default tenant. This
 * is a no-op in SaaS mode (where `users.owner` reflects platform ownership
 * separately) and outside the default tenant.
 */
async function mirrorPlatformOwner(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  isTenantOwner: boolean,
): Promise<void> {
  if (isSaasMode()) return;
  if (tenantId !== DEFAULT_TENANT_ID) return;
  const user = await userModel.get(userId);
  if (!user) return;
  if (user.owner === isTenantOwner) return;
  user.owner = isTenantOwner;
  await userModel.update(user);
}

/** Admits membership writes before a tenant can begin destructive deletion. */
export async function applyTenantOwnership(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  patch: TenantMembershipPatch,
): Promise<void> {
  await runTenantLifecycleOperation(tenantId, () =>
    applyAdmittedTenantOwnership(userModel, userId, tenantId, patch),
  );
}

/** @internal Caller must hold a confirmed tenant lifecycle admission until this resolves. */
export async function applyAdmittedTenantOwnership(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  patch: TenantMembershipPatch,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const existing = await memberModel.getByUser(userId);
  const isNewMember = !existing;
  if (isNewMember && !patch.deliveryId) {
    const payload = {
      tenantId,
      userId,
      isTenantOwner: patch.isTenantOwner,
    };
    await ExecuteHooks(Hook.MEMBER_BEING_ADDED, payload);
  }
  await upsertTenantMembership(userId, tenantId, patch);
  if (!patch.deliveryId) {
    await mirrorPlatformOwner(userModel, userId, tenantId, patch.isTenantOwner);
  }
  if (isNewMember && !patch.deliveryId) {
    const payload = {
      tenantId,
      userId,
      isTenantOwner: patch.isTenantOwner,
    };
    await ExecuteHooks(Hook.MEMBER_ADDED, payload);
  }
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
