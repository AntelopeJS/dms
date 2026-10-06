import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { sendAdminInviteEmail } from "../auth";
import { TenantModel } from "../db";
import type { InviteEmailDelivery } from "../invites";
import { inviteeDisplayName } from "../invitee-display-name";

async function tenantName(tenantId: string): Promise<string | undefined> {
  const tenant = await GetModel(TenantModel).get(tenantId);
  return tenant?.name || undefined;
}

/**
 * A pending tenant invitation, as its email needs it.
 *
 * @internal
 */
export interface TenantInviteEmail {
  tenantId: string;
  email: string;
  token: string;
  firstname?: string | null;
  lastname?: string | null;
  language?: string;
  /** Who sends the invitation. */
  inviterName?: string;
}

/**
 * Send a tenant invitation's email, naming the workspace and the inviter and
 * written in the invitation's language.
 *
 * @internal
 */
export async function sendTenantInviteEmail(
  invite: TenantInviteEmail,
): Promise<void> {
  await sendAdminInviteEmail(
    invite.email,
    invite.token,
    inviteeDisplayName(invite.firstname, invite.lastname),
    {
      workspaceName: await tenantName(invite.tenantId),
      inviterName: invite.inviterName,
      language: invite.language,
    },
  );
}

/**
 * {@link sendTenantInviteEmail}, reporting the outcome instead of throwing.
 * The failure is logged with its details; the caller only learns that the
 * email did not leave, which is what it may show the inviter.
 *
 * @internal
 */
export async function deliverTenantInviteEmail(
  invite: TenantInviteEmail,
): Promise<InviteEmailDelivery> {
  try {
    await sendTenantInviteEmail(invite);
    return "sent";
  } catch (error) {
    Logging.Error(
      `[DMS] invite email to "${invite.email}" could not be sent:`,
      error,
    );
    return "failed";
  }
}
