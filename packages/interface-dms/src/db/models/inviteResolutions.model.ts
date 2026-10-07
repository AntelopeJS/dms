import type { UserInvite } from "../tables/user_invites.table";
import type { InviteResolutionReason } from "../tables/inviteResolutions.table";

export interface InviteDecision {
  tenantId: string;
  invite: UserInvite;
  reason: InviteResolutionReason;
  userId?: string;
  replacement?: UserInvite;
  extensionKeys: string[];
}
