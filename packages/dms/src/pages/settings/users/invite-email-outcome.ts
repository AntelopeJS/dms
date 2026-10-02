import type { InviteEmailDelivery } from "@antelopejs/interface-dms/invites";

/**
 * How an invitation's email went, as an invite route answers it. `warning` is
 * an i18n key the frontend shows in place of the success message, so the
 * inviter learns the email did not leave; the reason stays in the server log.
 */
export interface InviteEmailOutcome {
  emailDelivery: InviteEmailDelivery;
  warning?: string;
}

export function inviteEmailOutcome(
  emailDelivery: InviteEmailDelivery,
  failureWarning: string,
): InviteEmailOutcome {
  if (emailDelivery === "sent") return { emailDelivery };
  return { emailDelivery, warning: failureWarning };
}
