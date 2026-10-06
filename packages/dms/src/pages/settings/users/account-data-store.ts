// Reads and removes the rows "Your data" exports and deletes: everything the
// DMS keys on a user id. The shape of the export and the deletion guards are
// in account-data.ts.

import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  SessionModel,
  type User,
  UserExternalIdentityModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import {
  RoleModel,
  TenantMemberModel,
  TenantModel,
  type UserInvite,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
  Hook,
  type UserDeletedHookPayload,
} from "@antelopejs/interface-dms/hooks";
import { DeleteFile } from "@antelopejs/interface-file-storage";
import {
  SignInAttemptsModel,
  UserEmailChangesModel,
  UserKnownDevicesModel,
  UserNotificationPreferencesModel,
  UserNotificationsModel,
} from "../../../db";
import { deleteUserExportsInTenant } from "../../../utils/export-jobs";
import { accountDeletionSchema } from "../../../validation/account-deletion.schema";
import { assertCurrentPassword } from "./current-password";
import {
  type AccountExport,
  type AccountInviteSource,
  type AccountMembershipSource,
  buildAccountExport,
  type DeletionBlocker,
  findDeletionBlockers,
  isDeletionConfirmed,
} from "./account-data";

const HTTP_CONFLICT = 409;
const DATA_I18N = "$page.settings.profile.data";
const LAST_OWNER_ERROR = `${DATA_I18N}.delete_error_last_owner`;

export interface AccountDeletionResult {
  success: true;
}

/** What deleting the account removes, for the confirmation to list. */
export interface AccountDeletionImpact {
  email: string;
  hasPassword: boolean;
  memberships: number;
  sessions: number;
  notifications: number;
  externalIdentities: number;
  /** Invitations the user sent: they stay valid. */
  invitesSent: number;
  /** Non-empty: the account cannot be deleted yet. */
  blockers: DeletionBlocker[];
}

/** Names of the roles `roleIds` stand for in `tenantId`. */
export async function roleNamesOf(
  tenantId: string,
  roleIds: string[],
): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const roles = await GetModel(RoleModel, tenantId).getBy("_id", ...roleIds);
  return roles.map((role) => role.name);
}

async function tenantNames(tenantIds: string[]): Promise<Map<string, string>> {
  const tenants = await GetModel(TenantModel).getMany(tenantIds);
  return new Map(tenants.map((tenant) => [tenant._id, tenant.name]));
}

/** The user's memberships in every tenant, with role names and co-owners. */
export async function loadMemberships(
  userId: string,
): Promise<AccountMembershipSource[]> {
  const rows = await GetModel(
    TenantMemberModel,
    CROSS_INSTANCE,
  ).listByUserWithTenantIds(userId);
  const names = await tenantNames(rows.map((row) => row.tenantId));
  return Promise.all(
    rows.map(async ({ tenantId, member }) => ({
      tenantId,
      tenantName: names.get(tenantId) ?? tenantId,
      member,
      roleNames: await roleNamesOf(tenantId, member.roleIds ?? []),
      otherOwners: await GetModel(
        TenantMemberModel,
        tenantId,
      ).countOwnersExcluding([userId]),
    })),
  );
}

async function invitesSentIn(
  tenantId: string,
  userId: string,
): Promise<AccountInviteSource[]> {
  const model = GetModel(UserInviteModel, tenantId);
  const rows = await model.table
    .filter((row) => row.key("invitedBy").eq(userId))
    .run();
  const invites = rows
    .map((row) => UserInviteModel.fromDatabase(row))
    .filter((invite): invite is UserInvite => invite !== undefined);
  return Promise.all(
    invites.map(async (invite) => ({
      tenantId,
      invite,
      roleNames: await roleNamesOf(tenantId, invite.roles_ids ?? []),
    })),
  );
}

/** Invitations the user sent in the tenants they belong to. */
async function loadInvitesSent(
  userId: string,
  memberships: AccountMembershipSource[],
): Promise<AccountInviteSource[]> {
  const perTenant = await Promise.all(
    memberships.map(({ tenantId }) => invitesSentIn(tenantId, userId)),
  );
  return perTenant.flat();
}

/** The export file of `user`, read from every table keyed on their id. */
export async function loadAccountExport(user: User): Promise<AccountExport> {
  const memberships = await loadMemberships(user._id);
  const [preferences, notifications, sessions, identities, invitesSent] =
    await Promise.all([
      GetModel(UserNotificationPreferencesModel).getByUserId(user._id),
      GetModel(UserNotificationsModel).getByUserId(user._id),
      GetModel(SessionModel).getByUserId(user._id),
      GetModel(UserExternalIdentityModel).getByUserId(user._id),
      loadInvitesSent(user._id, memberships),
    ]);
  return buildAccountExport({
    user,
    notificationPreferences: preferences?.preferences ?? {},
    memberships,
    notifications,
    sessions,
    identities,
    invitesSent,
    exportedAt: new Date(),
  });
}

/** Blockers of an account deletion, from its memberships and the platform. */
export async function loadDeletionBlockers(
  user: User,
  memberships: AccountMembershipSource[],
): Promise<DeletionBlocker[]> {
  const isPlatformOwner = user.owner === true;
  const otherPlatformOwners = isPlatformOwner
    ? await GetModel(UserModel).countOwnersExcluding([user._id])
    : 0;
  return findDeletionBlockers(memberships, {
    isPlatformOwner,
    otherPlatformOwners,
  });
}

/** What deleting `user` would remove, and what stands in the way. */
export async function loadDeletionImpact(
  user: User,
): Promise<AccountDeletionImpact> {
  const memberships = await loadMemberships(user._id);
  const [sessions, notifications, identities, invitesSent, blockers] =
    await Promise.all([
      GetModel(SessionModel).getByUserId(user._id),
      GetModel(UserNotificationsModel).countFeed(user._id),
      GetModel(UserExternalIdentityModel).getByUserId(user._id),
      loadInvitesSent(user._id, memberships),
      loadDeletionBlockers(user, memberships),
    ]);
  return {
    email: user.email,
    hasPassword: !!user.password,
    memberships: memberships.length,
    sessions: sessions.length,
    notifications: notifications.all,
    externalIdentities: identities.length,
    invitesSent: invitesSent.length,
    blockers,
  };
}

// Counted again right before the membership goes: another owner of the
// tenant deleting their account meanwhile must not leave it ownerless.
async function assertTenantKeepsAnOwner(
  userId: string,
  { tenantId, member }: AccountMembershipSource,
): Promise<void> {
  if (!member.isTenantOwner) return;
  const otherOwners = await GetModel(
    TenantMemberModel,
    tenantId,
  ).countOwnersExcluding([userId]);
  assert(otherOwners > 0, HTTP_CONFLICT, LAST_OWNER_ERROR);
}

/**
 * Leaves every tenant the way removing a member does, hooks included, with
 * the exports the user started there.
 */
async function leaveTenants(
  userId: string,
  memberships: AccountMembershipSource[],
): Promise<void> {
  for (const membership of memberships) {
    const { tenantId, member } = membership;
    await assertTenantKeepsAnOwner(userId, membership);
    await deleteUserExportsInTenant(tenantId, userId);
    await GetModel(TenantMemberModel, tenantId).delete(member._id);
    await ExecuteHooks(Hook.MEMBER_REMOVED, { tenantId, userIds: [userId] });
  }
}

/**
 * The memberships to leave, read again with what stands in the way: the
 * caller's own check may be stale by the time the deletion starts.
 */
async function loadDeletableMemberships(
  user: User,
): Promise<AccountMembershipSource[]> {
  const memberships = await loadMemberships(user._id);
  const blockers = await loadDeletionBlockers(user, memberships);
  assert(blockers.length === 0, HTTP_CONFLICT, LAST_OWNER_ERROR);
  return memberships;
}

/** What `Hook.USER_DELETED` hands its handlers for a user deleting itself. */
export function selfDeletionPayload(
  user: User,
  memberships: AccountMembershipSource[],
): UserDeletedHookPayload {
  return {
    userId: user._id,
    email: user.email,
    tenantIds: memberships.map(({ tenantId }) => tenantId),
    reason: "self",
  };
}

async function announceDeletion(
  user: User,
  memberships: AccountMembershipSource[],
): Promise<void> {
  try {
    await ExecuteHooks(
      Hook.USER_DELETED,
      selfDeletionPayload(user, memberships),
    );
  } catch (error) {
    Logging.Error("[DMS] USER_DELETED hook failed:", error);
  }
}

/**
 * Deletes the account and every row keyed on it: memberships, the exports
 * started in each tenant and their files, notifications and their
 * preferences, known devices and failed sign-ins, a pending email change,
 * sign-in links of providers, sessions — which signs the user out everywhere
 * — and the user row, with its two-factor data. The invitations the user sent
 * stay valid: they belong to the workspace. The caller has checked the
 * password and the confirmation; the blockers are checked again here, and
 * each tenant's owners right before leaving it.
 *
 * The one way the DMS deletes a user: any other path deleting one goes
 * through here, so `Hook.USER_DELETED` fires for every deletion.
 */
export async function deleteAccount(user: User): Promise<void> {
  const memberships = await loadDeletableMemberships(user);
  await leaveTenants(user._id, memberships);
  await GetModel(UserNotificationsModel).purgeUser(user._id);
  await GetModel(UserNotificationPreferencesModel).purgeUser(user._id);
  await GetModel(UserKnownDevicesModel).purgeUser(user._id);
  await GetModel(SignInAttemptsModel).purgeUser(user._id);
  await GetModel(UserEmailChangesModel).purgeUser(user._id);
  await GetModel(UserExternalIdentityModel).deleteByUserId(user._id);
  await GetModel(SessionModel).deleteByUserId(user._id);
  await GetModel(UserModel).delete(user._id);
  if (user.avatar?.key) {
    void DeleteFile(user.avatar.key).catch(() => undefined);
  }
  await announceDeletion(user, memberships);
}

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

/** The stored row of the signed-in user: the guard's copy may be stale. */
export async function requireStoredUser(user: User): Promise<User> {
  const stored = await GetModel(UserModel).get(user._id);
  assert(stored, HTTP_NOT_FOUND, "error.user_not_found");
  return stored;
}

/**
 * Checks the password, the typed e-mail and the blockers, then deletes the
 * account of the signed-in user. A last owner is refused with 409.
 *
 * @param user The signed-in user
 * @param body `{ password?, confirmation }`
 */
export async function requestAccountDeletion(
  user: User,
  body: unknown,
): Promise<AccountDeletionResult> {
  const input = assertValidation(body, (value) =>
    accountDeletionSchema.parse(value),
  );
  const userModel = GetModel(UserModel);
  const stored = await requireStoredUser(user);
  if (stored.password) {
    await assertCurrentPassword(userModel, stored, input.password);
  }
  assert(
    isDeletionConfirmed(stored, input.confirmation),
    HTTP_BAD_REQUEST,
    `${DATA_I18N}.delete_error_confirmation`,
  );
  await deleteAccount(stored);
  return { success: true };
}
