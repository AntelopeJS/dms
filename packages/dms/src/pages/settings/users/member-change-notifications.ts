// Notifications about members someone else edited or removed through the
// members table. Its guards run before the write and know the row as it was;
// the work they hand back runs once the write is done, in the same request.

import type { RequestContext } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { authenticateRequestPrincipal } from "@antelopejs/interface-dms/auth";
import type { AfterWrite } from "@antelopejs/interface-dms/base/types/guards";
import {
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import { haveSameMembers } from "../../../utils/notification-rules";
import {
  type NotificationActor,
  notifyMemberRemoved,
  notifyOwnershipChanged,
  notifyRolesChanged,
} from "../../../utils/workspace-notifications";

async function requestActor(ctx: RequestContext): Promise<NotificationActor> {
  const { user } = await authenticateRequestPrincipal(ctx);
  return { id: user._id, name: user.name || user.email };
}

async function announceEdit(
  tenantId: string,
  before: TenantMember,
  actor: NotificationActor,
): Promise<void> {
  const after = await GetModel(TenantMemberModel, tenantId).get(before._id);
  // Users changing their own membership know what they did.
  if (!after || after.userId === actor.id) return;
  if (!haveSameMembers(before.roleIds ?? [], after.roleIds ?? [])) {
    await notifyRolesChanged({
      tenantId,
      userId: after.userId,
      roleIds: after.roleIds ?? [],
      actor,
    });
  }
  // Compared as booleans: a row can hold null, which is not an owner either.
  const isOwner = after.isTenantOwner === true;
  if ((before.isTenantOwner === true) !== isOwner) {
    await notifyOwnershipChanged(after.userId, isOwner, actor);
  }
}

async function announceRemovals(
  tenantId: string,
  members: readonly TenantMember[],
  actor: NotificationActor,
): Promise<void> {
  const model = GetModel(TenantMemberModel, tenantId);
  for (const member of members) {
    if (await model.get(member._id)) continue;
    await notifyMemberRemoved({
      tenantId,
      removedUserId: member.userId,
      actor,
    });
  }
}

/**
 * The members table's edit guard hands this back with the row before the
 * edit: once the row is written, its member hears what changed.
 */
export async function announceMemberEdit(
  ctx: RequestContext,
  tenantId: string,
  before: TenantMember,
): Promise<AfterWrite> {
  const actor = await requestActor(ctx);
  return () => announceEdit(tenantId, before, actor);
}

/**
 * The members table's delete guard hands this back with the rows about to go:
 * each member actually removed hears it.
 */
export async function announceMemberRemovals(
  ctx: RequestContext,
  tenantId: string,
  members: readonly TenantMember[],
): Promise<AfterWrite> {
  const actor = await requestActor(ctx);
  return () => announceRemovals(tenantId, members, actor);
}
