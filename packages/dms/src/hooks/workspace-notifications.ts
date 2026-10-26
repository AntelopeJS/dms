import { Logging } from "@antelopejs/interface-core/logging";
import {
  Hook,
  type InviteDeletedHookPayload,
  RegisterHook,
} from "@antelopejs/interface-dms/hooks";
import {
  type NotifiedInviteOutcome,
  notifyInviteOutcome,
} from "./internal/workspace-notifications";

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
      // SAFETY: NOTIFIED_OUTCOMES checked above contains only the invitation outcomes supported by notifyInviteOutcome.
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
 * Notifies inviters of their invitations' outcome. Members hear of changes
 * other people made to their membership from the members table's guards.
 *
 * Called once per module generation, from `construct`; the hook registry
 * releases it with the generation.
 */
export function registerWorkspaceNotifications(): void {
  RegisterHook(Hook.INVITE_DELETED, onInviteDeleted);
}
