import { randomUUID } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel, type UserInvite, UserInviteModel } from "./db";
import { InviteResolutionsModel } from "./db/internal/inviteResolutions.model";
import { hashInviteToken } from "./db/internal/invite-token";
import { normalizeEmail, UserModel } from "./auth/db";
import randomstring from "randomstring";
import { fireAndForget } from "./utils/fire-and-forget";
import { MILLISECONDS_PER_DAY } from "./utils/internal/time";
import { ExecuteHooks, Hook, type InviteReplacementReason } from "./hooks";
import type { InviteExtensionPayloads } from "./invite-extensions";
import { DeliverInviteExtensions } from "./invite-extensions/internal/delivery";
import { completeAdmittedInviteResolution } from "./internal/invite-resolution";
import {
  type MintedInvite,
  resultFor,
  yieldToWinner,
} from "./internal/invite-handout";
import { decideInvite, loadInviteForAction } from "./invite-resolution";
import type { InviteResolution } from "./db/tables/inviteResolutions.table";
import { changeTenantMembers, type TenantMembersWrite } from "./tenant-members";
import { applyAdmittedTenantOwnership } from "./internal/tenant-ownership";
import { describeMembershipPatch } from "./internal/member-changes";
import {
  deliverTenantInviteEmail,
  sendTenantInviteEmail,
} from "./internal/invites";

export { inviteeDisplayName } from "./invitee-display-name";

export const INVITE_TOKEN_LENGTH = 64;
export const INVITE_EXPIRY_DAYS = 7;
const HTTP_CONFLICT = 409;

export interface InviteUserToTenantOptions {
  tenantId: string;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  language?: string;
  roleIds?: string[];
  asTenantOwner?: boolean;
  /** Opt-in: dispatch `sendAdminInviteEmail` after the invite row is created. */
  sendEmail?: boolean;
  /**
   * With `sendEmail`, wait for the email instead of sending it in the
   * background, and report its outcome as the result's `emailDelivery`. The
   * invitation is kept either way, so the caller can tell the inviter to
   * resend it when the email did not leave.
   */
  awaitEmailDelivery?: boolean;
  /** Who sends the invitation, named in its email. */
  inviterName?: string;
  /** Id of the user who sends the invitation, shown next to it in the list. */
  invitedBy?: string | null;
  /** Module payloads collected in the invite modal, keyed by extension key. */
  extensions?: InviteExtensionPayloads;
}

/** Whether a tenant invitation's email left. */
export type InviteEmailDelivery = "sent" | "failed";

export interface InvitedUserResult {
  kind: "invited";
  inviteId: string;
  /** See {@link CreateUserInviteTokenResult.token}. */
  token?: string;
  /**
   * Outcome of the invitation email. Set only when the call passed both
   * `sendEmail` and `awaitEmailDelivery`.
   */
  emailDelivery?: InviteEmailDelivery;
}

export type InviteUserToTenantResult =
  | { kind: "added"; userId: string }
  | InvitedUserResult;

/**
 * Invite a user (existing or not) to a tenant.
 *
 * - If the email belongs to an existing user, they are added directly via
 *   `applyTenantOwnership` and no token is generated. Invite extensions are
 *   delivered on the spot: there is no invitation for them to wait on, and the
 *   admin filled their fields in the same modal either way.
 * - Otherwise a `user_invites` row is created and (when `sendEmail` is true)
 *   `sendAdminInviteEmail` is dispatched: in the background by default, or
 *   awaited with `awaitEmailDelivery`, its outcome then reported as
 *   `emailDelivery`. A failed email never undoes the invitation.
 *
 * The caller is responsible for any pre-checks specific to its context
 * (e.g. "already a member" → 409 for the DMS users route). This helper is
 * intentionally side-effect-light: it does not throw on duplicates.
 */
export async function inviteUserToTenant(
  options: InviteUserToTenantOptions,
): Promise<InviteUserToTenantResult> {
  const result = await changeTenantMembers(options.tenantId, () =>
    planInvite(options),
  );
  if (!options.sendEmail || result.kind !== "invited") return result;
  const invited = await withToken(options, result);
  if (!invited) return result;
  const invite = { ...options, token: invited.token };
  if (!options.awaitEmailDelivery) {
    fireAndForget(
      sendTenantInviteEmail(invite),
      `invite email to "${options.email}"`,
    );
    return invited;
  }
  return {
    ...invited,
    emailDelivery: await deliverTenantInviteEmail(invite),
  };
}

/**
 * The invitation to email, with its token. A call that yielded to an
 * invitation it did not create holds no token, and its creator may never
 * email it (a call that failed after storing its decision), so this
 * reissues it.
 *
 * @returns The invitation, or undefined when it was retired meanwhile
 */
async function withToken(
  options: InviteUserToTenantOptions,
  result: InvitedUserResult,
): Promise<(InvitedUserResult & { token: string }) | undefined> {
  if (result.token !== undefined) return { ...result, token: result.token };
  const yielded = await loadInviteForAction(options.tenantId, result.inviteId);
  if (!yielded) return undefined;
  const reissued = await reissueUserInvite(
    options.tenantId,
    yielded,
    options.invitedBy,
  );
  return { kind: "invited", ...reissued };
}

async function planInvite(
  options: InviteUserToTenantOptions,
): Promise<TenantMembersWrite<InviteUserToTenantResult>> {
  const {
    tenantId,
    email,
    firstname = null,
    lastname = null,
    language = "en",
    roleIds = [],
    asTenantOwner = false,
    invitedBy = null,
    extensions,
  } = options;

  const userModel = GetModel(UserModel);
  const existingUser = await userModel.getByEmail(email);
  if (existingUser) {
    const userId = existingUser._id;
    const patch = { roleIds, isTenantOwner: asTenantOwner };
    const member = await GetModel(TenantMemberModel, tenantId).getByUser(
      userId,
    );
    return {
      changes: describeMembershipPatch(member, userId, patch),
      write: async () => {
        await applyAdmittedTenantOwnership(userModel, userId, tenantId, patch);
        await deliverToExistingMember(tenantId, email, userId, extensions);
        return { kind: "added", userId };
      },
    };
  }

  return {
    changes: [],
    write: async () => {
      const { inviteId, token } = await createAdmittedInviteToken({
        tenantId,
        email,
        firstname,
        lastname,
        language,
        roleIds,
        asTenantOwner,
        invitedBy,
        extensions,
      });
      return { kind: "invited", inviteId, token };
    },
  };
}

/**
 * The membership is already granted when this runs, so a failure here is
 * reported and swallowed: surfacing it would tell the admin the invitation
 * failed for a user who is in fact a member of the tenant.
 */
async function deliverToExistingMember(
  tenantId: string,
  email: string,
  userId: string,
  extensions: InviteExtensionPayloads | undefined,
): Promise<void> {
  if (!extensions) return;
  try {
    const member = await GetModel(TenantMemberModel, tenantId).getByUser(
      userId,
    );
    if (!member) {
      throw new Error(`no tenant member row for the account added as ${email}`);
    }
    await DeliverInviteExtensions(extensions, member, { tenantId, email });
  } catch (error) {
    Logging.Error(
      `[dms] invite extensions for "${email}" could not be delivered on direct add:`,
      error,
    );
  }
}

export interface CreateUserInviteTokenOptions {
  tenantId: string;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  language: string;
  roleIds: string[];
  asTenantOwner: boolean;
  /** Id of the user who sends the invitation; `null` when nobody signed in did. */
  invitedBy?: string | null;
  extensions?: InviteExtensionPayloads;
  /**
   * How to report the deletion of an invitation this one displaces. Defaults
   * to `replaced`; a resend passes `resent`, which reissues the same
   * invitation and must not have contributors undo what it carries.
   */
  replacementReason?: InviteReplacementReason;
  /** Exact incarnation to replace, including a retained snapshot during a retry. */
  replacesInvite?: UserInvite;
}

export interface CreateUserInviteTokenResult {
  inviteId: string;
  /**
   * The token the invitation's link carries. Only its digest is stored, so
   * only the call that minted it receives it: a call that yields to an
   * invitation a concurrent call created gets its `inviteId` alone.
   */
  token?: string;
}

/**
 * Low-level: create a `user_invites` row + token for a tenant. Replaces any
 * existing invite for the same email (within the tenant). Fires
 * INVITE_DELETED / INVITE_BEING_CREATED / INVITE_CREATED hooks.
 *
 * Concurrent calls that all find no invite for the email keep one, also when
 * another call replaces the invite in between: a call that loses returns the
 * kept invite when it carries the same content, and fails with HTTP 409 when
 * it does not.
 */
export async function createUserInviteToken(
  options: CreateUserInviteTokenOptions,
): Promise<CreateUserInviteTokenResult> {
  return changeTenantMembers(options.tenantId, async () => ({
    changes: [],
    write: () => createAdmittedInviteToken(options),
  }));
}

/**
 * Reissue a pending invitation under a fresh token, which retires its earlier
 * link. Only the digest of a token is stored, so this is how to get a new
 * link for an invitation. A call that loses to a concurrent reissue reissues
 * the winner in turn, so it always returns a token that works.
 *
 * @param invitedBy Id of the user who reissues it, recorded as its inviter
 * @throws HTTPResult(409) when the invitation it lost to was retired meanwhile
 */
export async function reissueUserInvite(
  tenantId: string,
  invite: UserInvite,
  invitedBy?: string | null,
): Promise<Required<CreateUserInviteTokenResult>> {
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
  if (token !== undefined) return { inviteId, token };
  const winner = await loadInviteForAction(tenantId, inviteId);
  assert(winner, HTTP_CONFLICT, "Invitation was retired while it was reissued");
  return reissueUserInvite(tenantId, winner, invitedBy);
}

async function createAdmittedInviteToken(
  options: CreateUserInviteTokenOptions,
): Promise<CreateUserInviteTokenResult> {
  const { tenantId, email, asTenantOwner, roleIds } = options;
  const userInviteModel = GetModel(UserInviteModel, tenantId);
  const existingInvite =
    options.replacesInvite ?? (await userInviteModel.getByEmail(email));
  const minted = mintInvite(options);
  const replacement = minted.invite;
  if (existingInvite) return replaceInvite(options, existingInvite, minted);
  await ExecuteHooks(Hook.INVITE_BEING_CREATED, {
    tenantId,
    email,
    asTenantOwner,
    roleIds,
  });
  try {
    await userInviteModel.insert(replacement);
  } catch (error) {
    if (!IsDuplicateKeyError(error)) throw error;
    const winner = await userInviteModel.getByEmail(email);
    return yieldOrCreateAgain(
      options,
      winner && (await currentInviteOf(options, winner)),
      minted,
    );
  }
  const rival = await userInviteModel.getOtherByEmail(email, replacement._id);
  if (rival) {
    const outcome = await userInviteModel.settleFresh(
      replacement._id,
      "withdrawn",
    );
    if (outcome !== "kept") return withdrawFreshInvite(options, minted, rival);
    const current = await currentInviteOf(options, replacement);
    if (current?._id !== replacement._id)
      return yieldOrCreateAgain(options, current, minted);
  }
  await ExecuteHooks(Hook.INVITE_CREATED, {
    tenantId,
    inviteId: replacement._id,
    email,
    asTenantOwner,
    roleIds,
  });
  return resultFor(replacement, minted);
}

async function replaceInvite(
  options: CreateUserInviteTokenOptions,
  invite: UserInvite,
  minted: MintedInvite,
): Promise<CreateUserInviteTokenResult> {
  let resolution: InviteResolution;
  try {
    resolution = await decideInvite({
      tenantId: options.tenantId,
      invite,
      reason: options.replacementReason ?? "replaced",
      replacement: minted.invite,
    });
  } catch (error) {
    const retry = await retryAfterRefusal(options, invite);
    if (retry === "read the email again")
      return createAdmittedInviteToken(options);
    if (retry === "replace the same invite")
      return replaceInvite(options, invite, minted);
    throw error;
  }
  await completeAdmittedInviteResolution(resolution);
  if (!resolution.replacement) throw new Error("Replacement snapshot missing");
  return resultFor(resolution.replacement, minted);
}

/** How a creation that `decideInvite` refused runs again, if it does. */
type RetryAfterRefusal =
  | "read the email again"
  | "replace the same invite"
  | undefined;

/**
 * How the creation runs again after `decideInvite` refused to replace `read`.
 * When a completed cancellation retired the invite a new invitation read, by
 * the time the email's invites are listed, it reads the email again. When it removed invites a completed cancellation
 * retired but left stored, such as a fresh invite whose withdrawal failed to
 * delete it, it replaces `read` again with the same options, so a new
 * invitation can still read the email again if `read` is cancelled meanwhile,
 * and any other refusal stands.
 *
 * @returns The retry, or undefined to keep the refusal
 */
async function retryAfterRefusal(
  options: CreateUserInviteTokenOptions,
  read: UserInvite,
): Promise<RetryAfterRefusal> {
  const { tenantId, email } = options;
  const stored = await GetModel(UserInviteModel, tenantId).listByEmail(email);
  const removed = await Promise.all(
    stored.map((invite) => removeIfCancelled(tenantId, invite._id)),
  );
  if (!options.replacesInvite && (await removeIfCancelled(tenantId, read._id)))
    return "read the email again";
  return removed.includes(true) ? "replace the same invite" : undefined;
}

/**
 * Deletes the invite's row when a completed cancellation retired it.
 *
 * @returns Whether its decision is such a cancellation
 */
async function removeIfCancelled(
  tenantId: string,
  inviteId: string,
): Promise<boolean> {
  const held = await GetModel(InviteResolutionsModel, tenantId).getForInvite(
    tenantId,
    inviteId,
  );
  if (held?.reason !== "cancelled" || held.replacement || !held.completed)
    return false;
  await completeAdmittedInviteResolution(held);
  return true;
}

/**
 * Withdraws a fresh invite that found a rival, through its decision: a
 * replacement decided on it first is kept instead, and its decider completes it.
 * Otherwise it yields to the email's current invite, or runs the creation
 * again when the email has none left.
 */
async function withdrawFreshInvite(
  options: CreateUserInviteTokenOptions,
  fresh: MintedInvite,
  rival: UserInvite,
): Promise<CreateUserInviteTokenResult> {
  const { tenantId } = options;
  const decisions = GetModel(InviteResolutionsModel, tenantId);
  const { resolution, claimed } = await decisions.withdraw(
    tenantId,
    fresh.invite,
  );
  if (resolution.replacement)
    return yieldToWinner(resolution.replacement, fresh);
  if (claimed)
    await GetModel(UserInviteModel, tenantId).delete(fresh.invite._id);
  return yieldOrCreateAgain(
    options,
    await currentInviteOf(options, rival),
    fresh,
  );
}

/** Yields to the email's current invite, or runs the creation again when the email has none left. */
function yieldOrCreateAgain(
  options: CreateUserInviteTokenOptions,
  current: UserInvite | undefined,
  lost: MintedInvite,
): Promise<CreateUserInviteTokenResult> | CreateUserInviteTokenResult {
  if (!current) return createAdmittedInviteToken(options);
  return yieldToWinner(current, lost);
}

/**
 * The invite a withdrawn fresh invite yields to: its rival while stored, else
 * the email's invite, or the replacement decided on it. A cancellation or an
 * expiry decided on it is completed first, so its token is never handed out.
 *
 * @returns The invite, or undefined when the email has none left
 */
async function currentInviteOf(
  options: CreateUserInviteTokenOptions,
  rival: UserInvite,
): Promise<UserInvite | undefined> {
  const { tenantId, email } = options;
  const invites = GetModel(UserInviteModel, tenantId);
  const invite =
    (await invites.get(rival._id)) ?? (await invites.getByEmail(email));
  if (!invite) return undefined;
  const decision = await GetModel(
    InviteResolutionsModel,
    tenantId,
  ).getForInvite(tenantId, invite._id);
  if (!decision) return followUndecided(options, invite);
  if (decision.reason === "accepted") return invite;
  if (decision.replacement) return decision.replacement;
  await completeAdmittedInviteResolution(decision);
  return currentInviteOf(options, invite);
}

/**
 * The invite to yield to when `invite` has no decision. A replacement, or a
 * fresh invite settled kept, is yielded to. A fresh invite that is the only
 * invite of its email is settled kept here, so its creator keeps it even if it
 * read a rival since retired. A fresh invite beside another invite yields to
 * that one, and a fresh invite settled withdrawn has its withdrawal finished
 * here, so no caller waits on its creator.
 *
 * @returns The invite, or undefined when the email has none left
 */
async function followUndecided(
  options: CreateUserInviteTokenOptions,
  invite: UserInvite,
): Promise<UserInvite | undefined> {
  const { tenantId, email } = options;
  if (invite.creationResolutionId || invite.freshOutcome === "kept")
    return invite;
  const invites = GetModel(UserInviteModel, tenantId);
  if (invite.freshOutcome !== "withdrawn") {
    if (!(await invites.isOnlyInviteOfEmail(invite))) {
      const other = await invites.getOtherByEmail(email, invite._id);
      return currentInviteOf(options, other ?? invite);
    }
    if ((await invites.settleFresh(invite._id, "kept")) === "kept")
      return invite;
  }
  const { resolution } = await GetModel(
    InviteResolutionsModel,
    tenantId,
  ).withdraw(tenantId, invite);
  if (resolution.replacement) return resolution.replacement;
  await invites.delete(invite._id);
  return currentInviteOf(options, invite);
}

function mintInvite(options: CreateUserInviteTokenOptions): MintedInvite {
  const token = randomstring.generate({ length: INVITE_TOKEN_LENGTH });
  const invite = UserInviteModel.fromPlainData({
    _id: randomUUID(),
    createdAt: new Date(),
    email: normalizeEmail(options.email),
    firstname: options.firstname ?? null,
    lastname: options.lastname ?? null,
    roles_ids: options.roleIds,
    language: options.language,
    token: hashInviteToken(token),
    asTenantOwner: options.asTenantOwner,
    expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * MILLISECONDS_PER_DAY),
    invitedBy: options.invitedBy ?? null,
    extensions: options.extensions ?? null,
    creationResolutionId: "",
  });
  return { invite, token };
}
