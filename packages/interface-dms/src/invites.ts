import { randomUUID } from "node:crypto";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel, type UserInvite, UserInviteModel } from "./db";
import { sendAdminInviteEmail } from "./auth";
import { UserModel } from "./auth/db";
import randomstring from "randomstring";
import { fireAndForget } from "./utils/fire-and-forget";
import { MILLISECONDS_PER_DAY } from "./utils/time";
import { ExecuteHooks, Hook, type InviteReplacementReason } from "./hooks";
import type { InviteExtensionPayloads } from "./invite-extensions";
import { DeliverInviteExtensions } from "./invite-extensions/delivery";
import {
  completeAdmittedInviteResolution,
  decideInvite,
} from "./invite-resolution";
import { runTenantLifecycleOperation } from "./tenant-lifecycle";
import { applyAdmittedTenantOwnership } from "./tenant-ownership";

export const INVITE_TOKEN_LENGTH = 64;
export const INVITE_EXPIRY_DAYS = 7;

export interface InviteUserToTenantOptions {
  tenantId: string;
  email: string;
  firstname?: string | null;
  lastname?: string | null;
  language?: string;
  roleIds?: string[];
  asTenantOwner?: boolean;
  skipEmailValidation?: boolean;
  /** Opt-in: dispatch `sendAdminInviteEmail` after the invite row is created. */
  sendEmail?: boolean;
  /** Module payloads collected in the invite modal, keyed by extension key. */
  extensions?: InviteExtensionPayloads;
}

/**
 * Combined display name of an invitee, or `undefined` when the invite carries
 * no name.
 */
export function inviteeDisplayName(
  firstname?: string | null,
  lastname?: string | null,
): string | undefined {
  const name = [firstname, lastname]
    .filter((part) => !!part)
    .join(" ")
    .trim();
  return name || undefined;
}

export type InviteUserToTenantResult =
  | { kind: "added"; userId: string }
  | { kind: "invited"; inviteId: string; token: string };

/**
 * Invite a user (existing or not) to a tenant.
 *
 * - If the email belongs to an existing user, they are added directly via
 *   `applyTenantOwnership` and no token is generated. Invite extensions are
 *   delivered on the spot: there is no invitation for them to wait on, and the
 *   admin filled their fields in the same modal either way.
 * - Otherwise a `user_invites` row is created and (when `sendEmail` is true)
 *   `sendAdminInviteEmail` is dispatched.
 *
 * The caller is responsible for any pre-checks specific to its context
 * (e.g. "already a member" → 409 for the DMS users route). This helper is
 * intentionally side-effect-light: it does not throw on duplicates.
 */
export async function inviteUserToTenant(
  options: InviteUserToTenantOptions,
): Promise<InviteUserToTenantResult> {
  const result = await runTenantLifecycleOperation(options.tenantId, () =>
    inviteAdmittedUser(options),
  );
  if (options.sendEmail && result.kind === "invited") {
    fireAndForget(
      sendAdminInviteEmail(
        options.email,
        result.token,
        inviteeDisplayName(options.firstname, options.lastname),
        { language: options.language },
      ),
      `invite email to "${options.email}"`,
    );
  }
  return result;
}

async function inviteAdmittedUser(
  options: InviteUserToTenantOptions,
): Promise<InviteUserToTenantResult> {
  const {
    tenantId,
    email,
    firstname = null,
    lastname = null,
    language = "en",
    roleIds = [],
    asTenantOwner = false,
    skipEmailValidation = false,
    extensions,
  } = options;

  const userModel = GetModel(UserModel);
  const existingUser = await userModel.getByEmail(email);
  if (existingUser) {
    await applyAdmittedTenantOwnership(userModel, existingUser._id, tenantId, {
      roleIds,
      isTenantOwner: asTenantOwner,
    });
    await deliverToExistingMember(
      tenantId,
      email,
      existingUser._id,
      extensions,
    );
    return { kind: "added", userId: existingUser._id };
  }

  const { inviteId, token } = await createAdmittedInviteToken({
    tenantId,
    email,
    firstname,
    lastname,
    language,
    roleIds,
    asTenantOwner,
    skipEmailValidation,
    extensions,
  });

  return { kind: "invited", inviteId, token };
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
  skipEmailValidation: boolean;
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
 */
export async function createUserInviteToken(
  options: CreateUserInviteTokenOptions,
): Promise<CreateUserInviteTokenResult> {
  return runTenantLifecycleOperation(options.tenantId, () =>
    createAdmittedInviteToken(options),
  );
}

async function createAdmittedInviteToken(
  options: CreateUserInviteTokenOptions,
): Promise<CreateUserInviteTokenResult> {
  const { tenantId, email, asTenantOwner, roleIds } = options;
  const userInviteModel = GetModel(UserInviteModel, tenantId);
  const existingInvite =
    options.replacesInvite ?? (await userInviteModel.getByEmail(email));
  const replacement = buildInviteSnapshot(options);
  if (existingInvite) {
    const resolution = await decideInvite({
      tenantId,
      invite: existingInvite,
      reason: options.replacementReason ?? "replaced",
      replacement,
    });
    await completeAdmittedInviteResolution(resolution);
    if (!resolution.replacement)
      throw new Error("Replacement snapshot missing");
    return {
      inviteId: resolution.replacement._id,
      token: resolution.replacement.token,
    };
  }
  await ExecuteHooks(Hook.INVITE_BEING_CREATED, {
    tenantId,
    email,
    asTenantOwner,
    roleIds,
  });
  await userInviteModel.insert(replacement);
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

function buildInviteSnapshot(
  options: CreateUserInviteTokenOptions,
): UserInvite {
  return UserInviteModel.fromPlainData({
    _id: randomUUID(),
    createdAt: new Date(),
    email: options.email,
    firstname: options.firstname ?? null,
    lastname: options.lastname ?? null,
    roles_ids: options.roleIds,
    language: options.language,
    token: randomstring.generate({ length: INVITE_TOKEN_LENGTH }),
    asTenantOwner: options.asTenantOwner,
    expiresAt: new Date(Date.now() + INVITE_EXPIRY_DAYS * MILLISECONDS_PER_DAY),
    skipEmailValidation: options.skipEmailValidation,
    extensions: options.extensions ?? null,
  });
}
