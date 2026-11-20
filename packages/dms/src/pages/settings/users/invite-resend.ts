import { assert } from "@antelopejs/interface-api-util";
import type { UserInvite } from "@antelopejs/interface-dms/db";
import { loadInviteForAction } from "@antelopejs/interface-dms/invite-resolution";
import {
  createUserInviteToken,
  inviteeDisplayName,
} from "@antelopejs/interface-dms/invites";
import { deliverTenantInviteEmail } from "@antelopejs/interface-dms/internal/invites";
import { getClientBaseUrl } from "../../../config";
import { buildAdminInviteSignupLink } from "../../../utils";
import {
  type InviteEmailOutcome,
  inviteEmailOutcome,
} from "./invite-email-outcome";

const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const INVITE_NOT_FOUND = "$page.settings.invites.error.not_found";

export const INVITE_RESEND_EMAIL_FAILED_WARNING =
  "$page.settings.invites.action.resend_email_failed";

/** Who resends an invitation: named in its email, recorded as its inviter. */
export interface InviteResender {
  name?: string;
  userId?: string;
}

/** A pending invitation's signup link, for the inviter to share by hand. */
export interface InviteLinkResponse {
  url: string;
}

async function loadPendingInvite(
  tenantId: string,
  inviteId: string,
): Promise<UserInvite> {
  const invite = await loadInviteForAction(tenantId, inviteId);
  assert(invite, HTTP_NOT_FOUND, INVITE_NOT_FOUND);
  return invite;
}

/**
 * Reissues the invitation under a fresh token, which retires its earlier
 * link. A concurrent reissue that wins keeps its token for its own caller,
 * so this call reissues the winner in turn.
 *
 * @returns The new token
 */
async function reissueInvite(
  tenantId: string,
  invite: UserInvite,
  invitedBy: string | undefined,
): Promise<string> {
  const { inviteId, token } = await createUserInviteToken({
    tenantId,
    replacesInvite: invite,
    email: invite.email,
    firstname: invite.firstname,
    lastname: invite.lastname,
    language: invite.language,
    roleIds: invite.roles_ids,
    asTenantOwner: invite.asTenantOwner,
    extensions: invite.extensions ?? undefined,
    replacementReason: "resent",
    invitedBy,
  });
  if (token !== undefined) return token;
  return reissueInvite(
    tenantId,
    await loadPendingInvite(tenantId, inviteId),
    invitedBy,
  );
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
  const invite = await loadPendingInvite(tenantId, inviteId);
  const token = await reissueInvite(tenantId, invite, inviter?.userId);

  const emailDelivery = await deliverTenantInviteEmail({
    tenantId,
    email: invite.email,
    token,
    firstname: invite.firstname,
    lastname: invite.lastname,
    language: invite.language,
    inviterName: inviter?.name,
  });
  return inviteEmailOutcome(emailDelivery, INVITE_RESEND_EMAIL_FAILED_WARNING);
}

/**
 * Reissues a pending invitation with a fresh token and answers its signup
 * link, without an email. Only the digest of a token is stored, so the link
 * an earlier email carried cannot be read back, and stops working.
 */
export async function copyInviteLink(
  tenantId: string,
  inviteId: string,
  invitedBy?: string,
): Promise<InviteLinkResponse> {
  const invite = await loadPendingInvite(tenantId, inviteId);
  assert(
    new Date(invite.expiresAt) > new Date(),
    HTTP_GONE,
    "$page.settings.invites.error.expired",
  );
  const token = await reissueInvite(tenantId, invite, invitedBy);
  const url = buildAdminInviteSignupLink(getClientBaseUrl() ?? "", {
    email: invite.email,
    token,
    inviteeName: inviteeDisplayName(invite.firstname, invite.lastname),
    language: invite.language,
  });
  return { url };
}
