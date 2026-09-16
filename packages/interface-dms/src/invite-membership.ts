import { GetModel } from "@antelopejs/interface-database-decorators";
import { InviteResolutionsModel } from "./db/models/inviteResolutions.model";
import type { InviteResolution } from "./db/tables/inviteResolutions.table";
import { UserModel } from "./auth/db/models/users.model";
import { TenantMemberModel } from "./db/models/tenantMembers.model";
import type { TenantMember } from "./db/tables/tenantMembers.table";
import { ExecuteHooks, Hook } from "./hooks";
import {
  applyAdmittedTenantOwnership,
  syncPlatformOwnerOnTenantOwnerChange,
} from "./tenant-ownership";

async function beginMembership(resolution: InviteResolution): Promise<void> {
  const { tenantId, userId, invite } = resolution;
  if (!userId) throw new Error("Accepted invite has no recipient");
  const model = GetModel(InviteResolutionsModel, tenantId);
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(userId);
  if (member) {
    await model.advanceMembership(resolution, "applied");
    return;
  }
  await ExecuteHooks(Hook.MEMBER_BEING_ADDED, {
    tenantId,
    userId,
    isTenantOwner: invite.asTenantOwner,
    deliveryId: resolution._id,
  });
  if (!(await model.advanceMembership(resolution, "applying"))) return;
  await applyAdmittedTenantOwnership(GetModel(UserModel), userId, tenantId, {
    roleIds: invite.roles_ids,
    isTenantOwner: invite.asTenantOwner,
    deliveryId: resolution._id,
  });
  const current = await model.get(resolution._id);
  if (!current) throw new Error("Invite decision disappeared");
  await model.advanceMembership(current, "applied");
}

async function reconcileMembership(
  resolution: InviteResolution,
): Promise<void> {
  if (!resolution.userId) throw new Error("Accepted invite has no recipient");
  const member = await GetModel(
    TenantMemberModel,
    resolution.tenantId,
  ).getByUser(resolution.userId);
  if (member?.inviteDeliveryId !== resolution._id) {
    throw new Error(
      "Invite membership application is indeterminate; automatic recreation is refused",
    );
  }
  await GetModel(InviteResolutionsModel, resolution.tenantId).advanceMembership(
    resolution,
    "applied",
  );
}

async function notifyMembership(
  resolution: InviteResolution,
  member: TenantMember,
): Promise<void> {
  if (member.inviteDeliveryId !== resolution._id) return;
  await syncPlatformOwnerOnTenantOwnerChange(
    GetModel(UserModel),
    member.userId,
    resolution.tenantId,
    member.isTenantOwner,
  );
  await ExecuteHooks(Hook.MEMBER_ADDED, {
    tenantId: resolution.tenantId,
    userId: member.userId,
    isTenantOwner: member.isTenantOwner,
    deliveryId: resolution._id,
  });
}

/** Grants at most one membership incarnation; a removed or indeterminate grant is never recreated. */
export async function ensureInviteMembership(
  resolution: InviteResolution,
): Promise<TenantMember> {
  const model = GetModel(InviteResolutionsModel, resolution.tenantId);
  let current = resolution;
  while (current.membershipPhase !== "applied") {
    const advance = { pending: beginMembership, applying: reconcileMembership }[
      current.membershipPhase
    ];
    await advance(current);
    const next = await model.get(current._id);
    if (!next) throw new Error("Invite decision disappeared");
    current = next;
  }
  if (!current.userId) throw new Error("Accepted invite has no recipient");
  const member = await GetModel(TenantMemberModel, current.tenantId).getByUser(
    current.userId,
  );
  if (!member)
    throw new Error(
      "Accepted membership was removed; automatic recreation is refused",
    );
  await notifyMembership(current, member);
  return member;
}
