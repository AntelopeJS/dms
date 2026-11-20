import { assert } from "@antelopejs/interface-api-util";
import type { UserInvite } from "../db";
import type { CreateUserInviteTokenResult } from "../invites";
import { isSameInviteContent } from "./invite-content";

const HTTP_CONFLICT = 409;

/**
 * An invitation snapshot, and the token whose digest it stores.
 *
 * @internal
 */
export interface MintedInvite {
  invite: UserInvite;
  token: string;
}

/**
 * Hands out the token only with the invitation it was minted for.
 *
 * @internal
 */
export function resultFor(
  invite: UserInvite,
  minted: MintedInvite,
): CreateUserInviteTokenResult {
  if (invite._id !== minted.invite._id) return { inviteId: invite._id };
  return { inviteId: invite._id, token: minted.token };
}

/**
 * Yields to the invitation a concurrent call kept when it carries the lost
 * invitation's content, else refuses with HTTP 409.
 *
 * @internal
 */
export function yieldToWinner(
  winner: UserInvite | undefined,
  lost: MintedInvite,
): CreateUserInviteTokenResult {
  assert(
    winner && isSameInviteContent(winner, lost.invite),
    HTTP_CONFLICT,
    "Invitation for this email was created concurrently with other content",
  );
  return resultFor(winner, lost);
}
