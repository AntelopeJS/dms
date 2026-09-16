import { assert } from "@antelopejs/interface-api-util";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  assertInviteReady,
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";

const HTTP_BAD_REQUEST = 400;
const INVALID_TOKEN_MESSAGE = "error.invalid_token";
const INVITE_EXPIRED_MESSAGE = "error.invite_expired";

export interface ResolvedInvite {
  invite: UserInvite;
  tenantId: string;
}

/** Resolves an invitation for the joining email; consumption arbitrates its terminal outcome. */
export async function resolveValidInvite(
  token: string,
  email: string,
): Promise<ResolvedInvite> {
  const inviteWithTenant = await GetModel(
    UserInviteModel,
    CROSS_INSTANCE,
  ).getByTokenWithTenant(token);
  assert(
    inviteWithTenant &&
      inviteWithTenant.invite.email.toLowerCase() === email.toLowerCase(),
    HTTP_BAD_REQUEST,
    INVALID_TOKEN_MESSAGE,
  );
  const { invite, tenantId } = inviteWithTenant;
  assert(
    new Date(invite.expiresAt) > new Date(),
    HTTP_BAD_REQUEST,
    INVITE_EXPIRED_MESSAGE,
  );
  await assertInviteReady(tenantId, invite);
  return { invite, tenantId };
}

/** Persists acceptance before granting membership; adverse decisions never reach effects. */
export async function consumeInvite(
  _userModel: UserModel,
  userId: string,
  resolved: ResolvedInvite,
): Promise<void> {
  const resolution = await decideInvite({
    ...resolved,
    reason: "accepted",
    userId,
  });
  await completeInviteResolution(resolution);
}
