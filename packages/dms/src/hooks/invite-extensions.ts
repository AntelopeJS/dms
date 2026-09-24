import {
  Hook,
  type InviteDeletedHookPayload,
  type InviteDeletedReason,
  type MemberRemovedHookPayload,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import {
  CleanupInviteExtensions,
  type InviteCleanupContext,
} from "@antelopejs/interface-dms/invite-extensions";
import { dmsHooks } from "./owned-hooks";

/**
 * Deletions that end the invitation, as opposed to the two that delete a row
 * while the invitation lives on — it was accepted, or reissued under a fresh
 * token. Cleaning up on those would undo what the invitee is about to receive,
 * or what a resend just carried over.
 */
const RETIRING_REASONS = new Set<InviteDeletedReason>([
  "cancelled",
  "replaced",
  "expired",
]);

async function onInviteDeleted(
  payload: InviteDeletedHookPayload,
): Promise<undefined> {
  if (!RETIRING_REASONS.has(payload.reason)) return undefined;

  const context: InviteCleanupContext = {
    reason: "invite-deleted",
    tenantId: payload.tenantId,
    inviteId: payload.inviteId,
    email: payload.email,
  };
  if (payload.deliveryId) context.deliveryId = payload.deliveryId;
  await CleanupInviteExtensions(payload.extensions, context, {
    retryOnFailure: payload.deliveryId !== undefined,
  });
  return undefined;
}

async function onMemberRemoved(
  payload: MemberRemovedHookPayload,
): Promise<undefined> {
  for (const userId of payload.userIds) {
    // No payload to hand over: it left with the invitation the member accepted.
    // A contributor keys its own data off the member instead.
    await CleanupInviteExtensions(undefined, {
      reason: "member-removed",
      tenantId: payload.tenantId,
      userId,
    });
  }
  return undefined;
}

/**
 * Let every invite extension undo what it derived, without each of them having
 * to subscribe to the invitation lifecycle itself.
 *
 * Registering replaces rather than adds: `construct` can run again, and a
 * contributor's cleanup called twice is not the same as called once.
 */
export function registerInviteExtensionCleanup(): void {
  UnregisterHook(Hook.INVITE_DELETED, onInviteDeleted);
  dmsHooks.register(Hook.INVITE_DELETED, onInviteDeleted);
  UnregisterHook(Hook.MEMBER_REMOVED, onMemberRemoved);
  dmsHooks.register(Hook.MEMBER_REMOVED, onMemberRemoved);
}
