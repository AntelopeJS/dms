import { assert } from "@antelopejs/interface-api-util";
import { loadInviteForAction } from "@antelopejs/interface-dms/invite-resolution";
import { createUserInviteToken } from "@antelopejs/interface-dms/invites";
import { deliverTenantInviteEmail } from "@antelopejs/interface-dms/internal/invites";
import {
  type InviteEmailOutcome,
  inviteEmailOutcome,
} from "./invite-email-outcome";

const HTTP_NOT_FOUND = 404;
const INVITE_NOT_FOUND = "$page.settings.invites.error.not_found";

export const INVITE_RESEND_EMAIL_FAILED_WARNING =
  "$page.settings.invites.action.resend_email_failed";

/** Who resends an invitation: named in its email, recorded as its inviter. */
export interface InviteResender {
  name?: string;
  userId?: string;
}

/**
 * Reissues a pending invitation with a fresh token and emails the new link,
 * waiting for the email so the inviter learns when it did not leave. The
 * reissued invitation is kept either way.
 */
export async function resendPendingInvite(
  tenantId: string,
  inviteId: string,
  inviter?: InviteResender,
): Promise<InviteEmailOutcome> {
  const existingInvite = await loadInviteForAction(tenantId, inviteId);
  assert(existingInvite, HTTP_NOT_FOUND, INVITE_NOT_FOUND);

  const { token } = await createUserInviteToken({
    tenantId,
    replacesInvite: existingInvite,
    email: existingInvite.email,
    firstname: existingInvite.firstname,
    lastname: existingInvite.lastname,
    language: existingInvite.language,
    roleIds: existingInvite.roles_ids,
    asTenantOwner: existingInvite.asTenantOwner,
    // Resending re-creates the row, so the module payloads have to be
    // carried over or the invitee would join without them — and the
    // displaced row must not read as an invitation that was retired.
    extensions: existingInvite.extensions ?? undefined,
    replacementReason: "resent",
    invitedBy: inviter?.userId,
  });

  const emailDelivery = await deliverTenantInviteEmail({
    tenantId,
    email: existingInvite.email,
    token,
    firstname: existingInvite.firstname,
    lastname: existingInvite.lastname,
    language: existingInvite.language,
    inviterName: inviter?.name,
  });
  return inviteEmailOutcome(emailDelivery, INVITE_RESEND_EMAIL_FAILED_WARNING);
}
