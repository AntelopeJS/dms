import { HTTPResult } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type InviteResolutionReason,
  type UserInvite,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/internal/inviteResolutions.model";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  assertInviteReady,
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";

const HTTP_BAD_REQUEST = 400;
const INVALID_TOKEN_MESSAGE = "error.invalid_token";
const INVITE_EXPIRED_MESSAGE = "error.invite_expired";

/** Why a link to an invitation that no longer exists stopped working. */
const RETIRED_INVITE_MESSAGES: Record<InviteResolutionReason, string> = {
  accepted: "error.invite_used",
  cancelled: "error.invite_revoked",
  replaced: "error.invite_replaced",
  resent: "error.invite_replaced",
  expired: INVITE_EXPIRED_MESSAGE,
};

export interface ResolvedInvite {
  invite: UserInvite;
  tenantId: string;
}

function isInviteFor(invite: UserInvite, email: string): boolean {
  return invite.email.toLowerCase() === email.toLowerCase();
}

/**
 * The refusal of a token no live invitation holds. Only the holder of the
 * token and its address learns why it was retired: anyone else gets the same
 * answer as for a token that never existed.
 */
async function retiredInviteMessage(
  token: string,
  email: string,
): Promise<string> {
  const resolution = await GetModel(
    InviteResolutionsModel,
    CROSS_INSTANCE,
  ).getForToken(token);
  if (!resolution || !isInviteFor(resolution.invite, email)) {
    return INVALID_TOKEN_MESSAGE;
  }
  return RETIRED_INVITE_MESSAGES[resolution.reason] ?? INVALID_TOKEN_MESSAGE;
}

async function loadLiveInvite(
  token: string,
  email: string,
): Promise<ResolvedInvite> {
  const inviteWithTenant = await GetModel(
    UserInviteModel,
    CROSS_INSTANCE,
  ).getByTokenWithTenant(token);
  if (!inviteWithTenant) {
    throw new HTTPResult(
      HTTP_BAD_REQUEST,
      await retiredInviteMessage(token, email),
    );
  }
  assert(
    isInviteFor(inviteWithTenant.invite, email),
    HTTP_BAD_REQUEST,
    INVALID_TOKEN_MESSAGE,
  );
  return inviteWithTenant;
}

/** Resolves an invitation for the joining email; consumption arbitrates its terminal outcome. */
export async function resolveValidInvite(
  token: string,
  email: string,
): Promise<ResolvedInvite> {
  const { invite, tenantId } = await loadLiveInvite(token, email);
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
