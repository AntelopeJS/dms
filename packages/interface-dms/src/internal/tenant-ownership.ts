import { GetModel } from "@antelopejs/interface-database-decorators";
import type { UserModel } from "../auth/db";
import { TenantMemberModel } from "../db/models/tenantMembers.model";
import type { TenantMember } from "../db/tables/tenantMembers.table";
import { ExecuteHooks, Hook } from "../hooks";
import type { TenantMembershipPatch } from "../tenant-ownership";
import { DEFAULT_TENANT_ID } from "../constants";
import { isSaasMode } from "../utils/saas-mode";

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

/**
 * Compatibility shim: in non-SaaS mode, the legacy `users.owner` boolean is
 * kept in sync with `TenantMember.isTenantOwner` on the default tenant. This
 * is a no-op in SaaS mode (where `users.owner` reflects platform ownership
 * separately, see `RegisterSaasMode`) and outside the default tenant.
 *
 * @internal
 */
export async function mirrorPlatformOwner(
  userModel: UserModel,
  userId: string,
  tenantId: string,
  isTenantOwner: boolean,
): Promise<void> {
  if (tenantId !== DEFAULT_TENANT_ID) return;
  if (await isSaasMode()) return;
  const user = await userModel.get(userId);
  if (!user) return;
  if (user.owner === isTenantOwner) return;
  user.owner = isTenantOwner;
  await userModel.update(user);
}
