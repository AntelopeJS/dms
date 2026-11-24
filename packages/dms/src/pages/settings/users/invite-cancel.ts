import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { UserInvite } from "@antelopejs/interface-dms/db";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/internal/inviteResolutions.model";
import type { InviteDeletedReason } from "@antelopejs/interface-dms/hooks";
import {
  completeInviteResolution,
  decideInvite,
  loadInviteForAction,
} from "@antelopejs/interface-dms/invite-resolution";

const HTTP_CONFLICT = 409;

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
 * The outcome after a conflict, when another decision was taken after the
 * invitation was read, such as the invitee accepting it meanwhile.
 */
async function decidedOtherwise(
  tenantId: string,
  inviteId: string,
): Promise<InviteCancellation | undefined> {
  const { outcome } = await cancellationTarget(tenantId, inviteId);
  return outcome.status === "already-resolved" ? outcome : undefined;
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
  if (!invite) return outcome;
  try {
    await cancelPendingInvite(tenantId, invite);
  } catch (error) {
    if (error instanceof HTTPResult && error.getStatus() === HTTP_CONFLICT) {
      const raced = await decidedOtherwise(tenantId, inviteId);
      if (raced) return raced;
    }
    throw error;
  }
  return outcome;
}

/** What {@link cancelInviteIfPending} would answer, without writing. */
export async function previewInviteCancellation(
  tenantId: string,
  inviteId: string,
): Promise<InviteCancellation> {
  return (await cancellationTarget(tenantId, inviteId)).outcome;
}
