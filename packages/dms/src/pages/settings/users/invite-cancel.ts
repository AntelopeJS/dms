import { GetModel } from "@antelopejs/interface-database-decorators";
import type { UserInvite } from "@antelopejs/interface-dms/db";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/internal/inviteResolutions.model";
import type { InviteDeletedReason } from "@antelopejs/interface-dms/hooks";
import {
  completeInviteResolution,
  decideInvite,
  loadInviteForAction,
} from "@antelopejs/interface-dms/invite-resolution";

/** Cancels an invitation, or resumes its cancellation, as Revoke does. */
export async function cancelPendingInvite(
  tenantId: string,
  invite: UserInvite,
): Promise<void> {
  const resolution = await decideInvite({
    tenantId,
    invite,
    reason: "cancelled",
  });
  await completeInviteResolution(resolution);
}

/** What cancelling an invitation did, or would do. */
export type InviteCancellation = {
  cancelled: boolean;
  status: "cancelled" | "already-resolved" | "not-found";
  /** The decision already taken, when `already-resolved`. */
  reason?: InviteDeletedReason;
  email?: string;
};

interface CancellationTarget {
  invite?: UserInvite;
  outcome: InviteCancellation;
}

async function cancellationTarget(
  tenantId: string,
  inviteId: string,
): Promise<CancellationTarget> {
  const invite = await loadInviteForAction(tenantId, inviteId);
  if (!invite) {
    return { outcome: { cancelled: false, status: "not-found" } };
  }
  const decided = await GetModel(InviteResolutionsModel, tenantId).getForInvite(
    tenantId,
    inviteId,
  );
  if (decided && decided.reason !== "cancelled") {
    return {
      outcome: {
        cancelled: false,
        status: "already-resolved",
        reason: decided.reason,
        email: invite.email,
      },
    };
  }
  return {
    invite,
    outcome: { cancelled: true, status: "cancelled", email: invite.email },
  };
}

/**
 * Cancels an invitation unless another decision already ended it, which
 * answers `already-resolved` instead of failing. A cancellation already
 * decided is resumed.
 */
export async function cancelInviteIfPending(
  tenantId: string,
  inviteId: string,
): Promise<InviteCancellation> {
  const { invite, outcome } = await cancellationTarget(tenantId, inviteId);
  if (invite) await cancelPendingInvite(tenantId, invite);
  return outcome;
}

/** What {@link cancelInviteIfPending} would answer, without writing. */
export async function previewInviteCancellation(
  tenantId: string,
  inviteId: string,
): Promise<InviteCancellation> {
  return (await cancellationTarget(tenantId, inviteId)).outcome;
}
