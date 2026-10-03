// Notifications about members someone else edited or removed through the
// members table. Its guards run before the write and know the row as it was;
// the realtime mutation listener runs once the write is done and knows who
// made it. The guard leaves the row here, the listener picks it up.

import { GetModel } from "@antelopejs/interface-database-decorators";
import type {
  RealtimeMutationContext,
  RealtimeMutationEventType,
  RealtimePresenceActor,
} from "@antelopejs/interface-dms/base/table-view";
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

/** Data API of the members table, whose mutations the listener reads. */
const MEMBERS_API_LOCATION = "/api/tables/members";
/** A guard and the write it precedes run in one request; anything older is a write that failed. */
const PENDING_TTL_MS = 60 * 1000;

interface PendingChange {
  tenantId: string;
  member: TenantMember;
  at: number;
}

const pendingEdits = new Map<string, PendingChange>();
const pendingRemovals = new Map<string, PendingChange>();

function remember(
  pending: Map<string, PendingChange>,
  tenantId: string,
  member: TenantMember,
): void {
  const now = Date.now();
  for (const [id, change] of pending) {
    if (now - change.at > PENDING_TTL_MS) pending.delete(id);
  }
  pending.set(member._id, { tenantId, member, at: now });
}

function take(
  pending: Map<string, PendingChange>,
  memberId: string,
): PendingChange | undefined {
  const change = pending.get(memberId);
  pending.delete(memberId);
  if (!change || Date.now() - change.at > PENDING_TTL_MS) return undefined;
  return change;
}

/** Called by the members table's edit guard, with the row before the edit. */
export function rememberMemberEdit(
  tenantId: string,
  member: TenantMember,
): void {
  remember(pendingEdits, tenantId, member);
}

/** Called by the members table's delete guard, with the rows about to go. */
export function rememberMemberRemovals(
  tenantId: string,
  members: readonly TenantMember[],
): void {
  for (const member of members) remember(pendingRemovals, tenantId, member);
}

function toActor(actor: RealtimePresenceActor): NotificationActor {
  return { id: actor.id, name: actor.displayName || actor.id };
}

async function announceEdit(
  memberId: string,
  actor: NotificationActor,
): Promise<void> {
  const pending = take(pendingEdits, memberId);
  if (!pending) return;
  const { tenantId, member: before } = pending;
  const after = await GetModel(TenantMemberModel, tenantId).get(memberId);
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

async function announceRemoval(
  memberId: string,
  actor: NotificationActor,
): Promise<void> {
  const pending = take(pendingRemovals, memberId);
  if (!pending) return;
  const { tenantId, member } = pending;
  if (await GetModel(TenantMemberModel, tenantId).get(memberId)) return;
  await notifyMemberRemoved({ tenantId, removedUserId: member.userId, actor });
}

const ANNOUNCERS: Partial<
  Record<
    RealtimeMutationEventType,
    (memberId: string, actor: NotificationActor) => Promise<void>
  >
> = {
  updated: announceEdit,
  deleted: announceRemoval,
};

/** Realtime mutation listener: notifies once the members table wrote. */
export async function announceMemberMutation(
  context: RealtimeMutationContext,
): Promise<void> {
  const announce = ANNOUNCERS[context.eventType];
  if (
    !announce ||
    !context.actor ||
    context.controllerLocation.replace(/\/+$/, "") !== MEMBERS_API_LOCATION
  ) {
    return;
  }
  const actor = toActor(context.actor);
  for (const memberId of context.ids) await announce(memberId, actor);
}
