import { Logging } from "@antelopejs/interface-core/logging";
import { registerRealtimeMutationListener } from "@antelopejs/interface-dms/base/table-view";
import {
  Hook,
  type InviteDeletedHookPayload,
  RegisterHook,
} from "@antelopejs/interface-dms/hooks";
import { announceMemberMutation } from "../pages/settings/users/member-change-notifications";
import {
  type NotifiedInviteOutcome,
  notifyInviteOutcome,
} from "../utils/workspace-notifications";

const NOTIFIED_OUTCOMES: ReadonlySet<string> = new Set<NotifiedInviteOutcome>([
  "accepted",
  "expired",
]);

/**
 * Runs inside the invitation's completion, which a throwing handler would
 * leave incomplete: a notification failure is logged and swallowed.
 */
async function onInviteDeleted(
  payload: InviteDeletedHookPayload,
): Promise<undefined> {
  if (!payload.deliveryId || !NOTIFIED_OUTCOMES.has(payload.reason)) {
    return undefined;
  }
  try {
    await notifyInviteOutcome(
      payload.tenantId,
      payload.deliveryId,
      payload.reason as NotifiedInviteOutcome,
    );
  } catch (error) {
    Logging.Error(
      `[DMS] Could not notify the inviter of invitation "${payload.inviteId}": ${String(error)}`,
    );
  }
  return undefined;
}

/**
 * Notifies inviters of their invitations' outcome and members of changes
 * other people made to their membership.
 *
 * Called once per module generation, from `construct`; the hook and listener
 * registries release these with the generation.
 */
export function registerWorkspaceNotifications(): void {
  RegisterHook(Hook.INVITE_DELETED, onInviteDeleted);
  registerRealtimeMutationListener(announceMemberMutation);
}
