import { randomUUID } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { IsDuplicateKeyError } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel, type UserInvite, UserInviteModel } from "./db";
import { InviteResolutionsModel } from "./db/internal/inviteResolutions.model";
import { normalizeEmail, UserModel } from "./auth/db";
import randomstring from "randomstring";
import { fireAndForget } from "./utils/fire-and-forget";
import { MILLISECONDS_PER_DAY } from "./utils/internal/time";
import { ExecuteHooks, Hook, type InviteReplacementReason } from "./hooks";
import type { InviteExtensionPayloads } from "./invite-extensions";
import { DeliverInviteExtensions } from "./invite-extensions/internal/delivery";
import { completeAdmittedInviteResolution } from "./internal/invite-resolution";
import { isSameInviteContent } from "./internal/invite-content";
import { decideInvite } from "./invite-resolution";
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
  token: string;
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
  const invite = { ...options, token: result.token };
  if (!options.awaitEmailDelivery) {
    fireAndForget(
      sendTenantInviteEmail(invite),
      `invite email to "${options.email}"`,
    );
    return result;
  }
  return {
    ...result,
    emailDelivery: await deliverTenantInviteEmail(invite),
  };
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
  token: string;
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

async function createAdmittedInviteToken(
  options: CreateUserInviteTokenOptions,
): Promise<CreateUserInviteTokenResult> {
  const { tenantId, email, asTenantOwner, roleIds } = options;
  const userInviteModel = GetModel(UserInviteModel, tenantId);
  const existingInvite =
    options.replacesInvite ?? (await userInviteModel.getByEmail(email));
  const replacement = buildInviteSnapshot(options);
  if (existingInvite)
    return replaceInvite(options, existingInvite, replacement);
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
    return yieldToWinner(await userInviteModel.getByEmail(email), replacement);
  }
  const rival = await userInviteModel.getOtherByEmail(email, replacement._id);
  if (rival) return withdrawFreshInvite(options, replacement, rival);
  await ExecuteHooks(Hook.INVITE_CREATED, {
    tenantId,
    inviteId: replacement._id,
    token: replacement.token,
    email,
    asTenantOwner,
    roleIds,
  });
  return { inviteId: replacement._id, token: replacement.token };
}

async function replaceInvite(
  options: CreateUserInviteTokenOptions,
  invite: UserInvite,
  replacement: UserInvite,
): Promise<CreateUserInviteTokenResult> {
  let resolution: InviteResolution;
  try {
    resolution = await decideInvite({
      tenantId: options.tenantId,
      invite,
      reason: options.replacementReason ?? "replaced",
      replacement,
    });
  } catch (error) {
    const retry = await retryAfterRefusal(options, invite);
    if (!retry) throw error;
    return createAdmittedInviteToken(retry);
  }
  await completeAdmittedInviteResolution(resolution);
  if (!resolution.replacement) throw new Error("Replacement snapshot missing");
  return {
    inviteId: resolution.replacement._id,
    token: resolution.replacement.token,
  };
}

/**
 * The creation to run again after `decideInvite` refused to replace `read`.
 * When a completed cancellation retired the invite a new invitation read, it
 * reads the email again. When it removed invites a completed cancellation
 * retired but left stored, such as a fresh invite whose withdrawal failed to
 * delete it, it replaces `read` again, so any other refusal stands.
 *
 * @returns The options to run again with, or undefined to keep the refusal
 */
async function retryAfterRefusal(
  options: CreateUserInviteTokenOptions,
  read: UserInvite,
): Promise<CreateUserInviteTokenOptions | undefined> {
  const { tenantId, email } = options;
  if (!options.replacesInvite && (await removeIfCancelled(tenantId, read._id)))
    return options;
  const stored = await GetModel(UserInviteModel, tenantId).listByEmail(email);
  const removed = await Promise.all(
    stored.map((invite) => removeIfCancelled(tenantId, invite._id)),
  );
  return removed.includes(true)
    ? { ...options, replacesInvite: read }
    : undefined;
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
  fresh: UserInvite,
  rival: UserInvite,
): Promise<CreateUserInviteTokenResult> {
  const { tenantId } = options;
  const decisions = GetModel(InviteResolutionsModel, tenantId);
  const { resolution, claimed } = await decisions.withdraw(tenantId, fresh);
  if (!claimed) return yieldToWinner(resolution.replacement ?? rival, fresh);
  await GetModel(UserInviteModel, tenantId).delete(fresh._id);
  const winner = await currentInviteOf(options, rival);
  if (!winner) return createAdmittedInviteToken(options);
  return yieldToWinner(winner, fresh);
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
  if (!decision || decision.reason === "accepted") return invite;
  if (decision.replacement) return decision.replacement;
  await completeAdmittedInviteResolution(decision);
  return currentInviteOf(options, invite);
}

function yieldToWinner(
  winner: UserInvite | undefined,
  lost: UserInvite,
): CreateUserInviteTokenResult {
  assert(
    winner && isSameInviteContent(winner, lost),
    HTTP_CONFLICT,
    "Invitation for this email was created concurrently with other content",
  );
  return { inviteId: winner._id, token: winner.token };
}

function buildInviteSnapshot(
  options: CreateUserInviteTokenOptions,
): UserInvite {
  return UserInviteModel.fromPlainData({
    _id: randomUUID(),
    createdAt: new Date(),
    email: normalizeEmail(options.email),
    firstname: options.firstname ?? null,
    lastname: options.lastname ?? null,
    roles_ids: options.roleIds,
    language: options.language,
    token: randomstring.generate({ length: INVITE_TOKEN_LENGTH }),
    asTenantOwner: options.asTenantOwner,
    expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * MILLISECONDS_PER_DAY),
    invitedBy: options.invitedBy ?? null,
    extensions: options.extensions ?? null,
    creationResolutionId: "",
  });
}
