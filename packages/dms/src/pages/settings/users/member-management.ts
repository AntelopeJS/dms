import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  RoleModel,
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  clearPlatformOwnerOnMemberRemoval,
  syncPlatformOwnerOnTenantOwnerChange,
} from "@antelopejs/interface-dms/tenant-ownership";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { ExecuteHooks, Hook } from "@antelopejs/interface-dms/hooks";
import { changeTenantMembers } from "@antelopejs/interface-dms/tenant-members";
import { observeTenantLifecycle } from "@antelopejs/interface-dms/tenant-lifecycle";
import {
  describeMemberEdit,
  describeMemberRemoval,
  type MemberEdit,
} from "@antelopejs/interface-dms/internal/member-changes";
import type { MemberChange } from "@antelopejs/interface-dms/hooks";
import type { ConfirmDialogSerialized } from "@antelopejs/interface-dms/base/table-view";
import { isSaasMode } from "@antelopejs/interface-dms/utils/saas-mode";
import {
  announceMemberChanges,
  type MemberAccess,
  type MemberAccessChange,
} from "../../../automation/member-events";
import { notifyMenuAccessChanged } from "../../../implementations/dms/page";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const MEMBER_NOT_FOUND = "$page.settings.members.error.user_not_found";

/** How a tenant-owner flag moves on an edit, if it moves at all. */
export type OwnerChange = "promote" | "demote" | null;

/**
 * @param current The membership as stored
 * @param requested The owner flag the edit asks for, if it sets one
 */
export function detectOwnerChange(
  current: Pick<TenantMember, "isTenantOwner">,
  requested: boolean | undefined,
): OwnerChange {
  if (requested === undefined) return null;
  if (current.isTenantOwner === requested) return null;
  return requested ? "promote" : "demote";
}

/** Refuse to take the owner role from the tenant's last owner. */
export async function assertNotLastTenantOwner(
  tenantId: string,
  current: Pick<TenantMember, "userId">,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const remaining = await memberModel.countOwnersExcluding([current.userId]);
  assert(
    remaining > 0,
    HTTP_CONFLICT,
    "$page.settings.members.error.last_owner",
  );
}

/**
 * Checks and side effects of an owner flag change, run before the membership
 * row is written — by the table's edit guard and by the owner route alike,
 * both inside the `changeTenantMembers` call that announced the change.
 */
export async function prepareOwnerChange(
  tenantId: string,
  current: Pick<TenantMember, "userId" | "isTenantOwner">,
  requested: boolean | undefined,
): Promise<void> {
  const change = detectOwnerChange(current, requested);
  if (change === null) return;
  if (change === "demote") await assertNotLastTenantOwner(tenantId, current);
  await syncPlatformOwnerOnTenantOwnerChange(
    GetModel(UserModel),
    current.userId,
    tenantId,
    requested === true,
  );
}

/** Load a membership of the tenant, or answer 404. */
export async function requireMember(
  tenantId: string,
  memberId: string,
): Promise<TenantMember> {
  const member = await GetModel(TenantMemberModel, tenantId).get(memberId);
  assert(member, HTTP_NOT_FOUND, MEMBER_NOT_FOUND);
  return member;
}

/** A membership after an owner flag change, and how the flag moved. */
export interface OwnershipChangeResult {
  member: TenantMember;
  change: OwnerChange;
  /** The membership's access before the change. */
  before: MemberAccess;
}

/** Give or take the owner role of a member. */
export async function setMemberOwnership(
  tenantId: string,
  memberId: string,
  isTenantOwner: boolean,
): Promise<OwnershipChangeResult> {
  return changeTenantMembers(tenantId, async () => {
    const member = await requireMember(tenantId, memberId);
    return {
      changes: describeMemberEdit(member, { isTenantOwner }),
      write: async () => {
        const change = detectOwnerChange(
          { isTenantOwner: member.isTenantOwner === true },
          isTenantOwner,
        );
        const before: MemberAccess = {
          userId: member.userId,
          roleIds: [...(member.roleIds ?? [])],
          isTenantOwner: member.isTenantOwner === true,
        };
        await prepareOwnerChange(tenantId, member, isTenantOwner);
        member.isTenantOwner = isTenantOwner;
        await GetModel(TenantMemberModel, tenantId).update(member);
        return { member, change, before };
      },
    };
  });
}

/** What removing a member takes away, for the confirmation to spell out. */
export interface MemberRemovalImpact {
  memberId: string;
  name: string;
  email: string;
  /** Names of the roles the member holds in the tenant. */
  roles: string[];
  isTenantOwner: boolean;
  /** Removing the member would leave the tenant without an owner. */
  isLastOwner: boolean;
  /** The member is the one asking. */
  isSelf: boolean;
}

async function roleNames(
  tenantId: string,
  roleIds: string[],
): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const roles = await GetModel(RoleModel, tenantId).getBy("_id", ...roleIds);
  return roles.map((role) => role.name);
}

/**
 * @param tenantId Tenant the member belongs to
 * @param memberId Membership to remove
 * @param requesterUserId User asking, to tell them they are removing themself
 */
export async function buildMemberRemovalImpact(
  tenantId: string,
  memberId: string,
  requesterUserId: string,
): Promise<MemberRemovalImpact> {
  const member = await requireMember(tenantId, memberId);
  const user = await GetModel(UserModel).get(member.userId);
  const otherOwners = await GetModel(
    TenantMemberModel,
    tenantId,
  ).countOwnersExcluding([member.userId]);
  return {
    memberId: member._id,
    name: user?.name ?? "",
    email: user?.email ?? "",
    roles: await roleNames(tenantId, member.roleIds ?? []),
    isTenantOwner: member.isTenantOwner === true,
    isLastOwner: member.isTenantOwner === true && otherOwners === 0,
    isSelf: member.userId === requesterUserId,
  };
}

const REMOVAL_I18N = "$page.settings.members.remove";

/**
 * The confirmation of a member's removal, worded for that member: the roles
 * they lose and that their records stay — or, for the last owner, why they
 * cannot be removed (an acknowledge-only dialog).
 */
export function memberRemovalConfirm(
  impact: MemberRemovalImpact,
): ConfirmDialogSerialized {
  const params = { name: impact.name || impact.email };
  if (impact.isLastOwner) {
    const key = impact.isSelf ? "last_owner_self" : "last_owner_other";
    return {
      title: `${REMOVAL_I18N}.${key}_title`,
      description: `${REMOVAL_I18N}.last_owner_description`,
      params,
      icon: "i-ph-crown",
      color: "warning",
      cancelLabel: "$page.settings.members.confirm.close",
      blocked: true,
    };
  }
  const who = impact.isSelf ? "self" : "other";
  const roles = impact.isTenantOwner
    ? "$page.settings.members.owner"
    : impact.roles.join(", ") || "$page.settings.members.no_role";
  return {
    title: `${REMOVAL_I18N}.title_${who}`,
    description: `${REMOVAL_I18N}.description_${who}`,
    params,
    icon: "i-ph-user-minus",
    color: "error",
    confirmLabel: `${REMOVAL_I18N}.confirm`,
    impact: [
      {
        icon: "i-ph-key",
        label: `${REMOVAL_I18N}.impact_roles`,
        count: roles,
      },
      { icon: "i-ph-note-pencil", label: `${REMOVAL_I18N}.impact_records` },
    ],
  };
}

/**
 * Outside SaaS mode the platform owners are the default tenant's owners, so
 * removing the last of them would leave the platform without one. In SaaS mode
 * tenant owners are customers and platform ownership is managed separately.
 */
export async function assertNotLastPlatformOwnerOnDelete(
  targets: TenantMember[],
): Promise<void> {
  if (await isSaasMode()) return;
  const userModel = GetModel(UserModel);
  const removedOwnerUserIds = targets
    .filter((target) => target.isTenantOwner === true)
    .map((target) => target.userId);
  if (removedOwnerUserIds.length === 0) return;
  const remaining = await userModel.countOwnersExcluding(removedOwnerUserIds);
  assert(
    remaining > 0,
    HTTP_CONFLICT,
    "$page.settings.members.error.last_owner_delete",
  );
}

async function assertTenantKeepsOwner(
  tenantId: string,
  targets: readonly TenantMember[],
): Promise<void> {
  const remaining = await GetModel(
    TenantMemberModel,
    tenantId,
  ).countOwnersExcluding(targets.map((target) => target.userId));
  assert(
    remaining > 0,
    HTTP_CONFLICT,
    "$page.settings.members.error.last_owner_delete",
  );
}

/**
 * Checks and side effects of removing members, run before their rows are
 * deleted, inside the `changeTenantMembers` call that announced the removal:
 * the tenant and the platform keep an owner, a removed platform owner loses
 * the flag, and `Hook.MEMBER_REMOVED` fires while the rows still exist.
 */
export async function prepareMemberRemoval(
  tenantId: string,
  targets: TenantMember[],
): Promise<void> {
  await assertTenantKeepsOwner(tenantId, targets);
  await assertNotLastPlatformOwnerOnDelete(targets);
  const userModel = GetModel(UserModel);
  for (const target of targets) {
    await clearPlatformOwnerOnMemberRemoval(
      userModel,
      target.userId,
      tenantId,
      target.isTenantOwner,
    );
  }
  await ExecuteHooks(Hook.MEMBER_REMOVED, {
    tenantId,
    userIds: targets.map((target) => target.userId),
  });
}

/** How requested roles combine with the stored ones. */
export type MemberRolesMode = "replace" | "add" | "remove";

/** A request-free edit of a member's roles and owner flag. */
export interface MemberRolesRequest {
  /** Absent: roles unchanged. */
  roleIds?: string[];
  mode?: MemberRolesMode;
  /** Absent: owner flag unchanged. */
  isTenantOwner?: boolean;
}

/** A member's roles and owner flag around an edit. */
export type MemberRolesResult = {
  changed: boolean;
  userId: string;
  roleIds: string[];
  previousRoleIds: string[];
  isTenantOwner: boolean;
  previousIsTenantOwner: boolean;
};

/** The membership an edit applies to, the edit, and what it changes. */
interface MemberEditPlan {
  member: TenantMember;
  edit: MemberEdit;
  changes: MemberChange[];
}

function combineRoles(
  stored: readonly string[],
  requested: readonly string[],
  mode: MemberRolesMode,
): string[] {
  if (mode === "replace") return [...new Set(requested)];
  if (mode === "add") return [...new Set([...stored, ...requested])];
  return stored.filter((id) => !requested.includes(id));
}

async function assertKnownRoles(
  tenantId: string,
  roleIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(roleIds)];
  if (unique.length === 0) return;
  const roles = await GetModel(RoleModel, tenantId).getBy("_id", ...unique);
  const known = new Set(roles.map((role) => role._id));
  const unknown = unique.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `unknown role ${unknown.map((id) => `"${id}"`).join(", ")} in workspace "${tenantId}"`,
    );
  }
}

async function requireMemberByUser(
  tenantId: string,
  userId: string,
): Promise<TenantMember> {
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(userId);
  if (!member) {
    throw new Error(
      `user "${userId}" is not a member of workspace "${tenantId}"`,
    );
  }
  return member;
}

function memberAccess(member: TenantMember): MemberAccess {
  return {
    userId: member.userId,
    roleIds: [...(member.roleIds ?? [])],
    isTenantOwner: member.isTenantOwner === true,
  };
}

function editedAccess(member: TenantMember, edit: MemberEdit): MemberAccess {
  const before = memberAccess(member);
  return {
    userId: before.userId,
    roleIds: edit.roleIds ? [...edit.roleIds] : before.roleIds,
    isTenantOwner: edit.isTenantOwner ?? before.isTenantOwner,
  };
}

function rolesResult({ before, after }: MemberAccessChange): MemberRolesResult {
  const roleIds = after.roleIds ?? [];
  const previousRoleIds = before.roleIds ?? [];
  const isTenantOwner = after.isTenantOwner === true;
  const previousIsTenantOwner = before.isTenantOwner === true;
  return {
    changed:
      isTenantOwner !== previousIsTenantOwner ||
      roleIds.length !== previousRoleIds.length ||
      roleIds.some((id) => !previousRoleIds.includes(id)),
    userId: after.userId,
    roleIds,
    previousRoleIds,
    isTenantOwner,
    previousIsTenantOwner,
  };
}

/** Reads a membership by user and describes what `request` changes on it. */
async function planMemberEdit(
  tenantId: string,
  userId: string,
  request: MemberRolesRequest,
): Promise<MemberEditPlan> {
  const member = await requireMemberByUser(tenantId, userId);
  const edit: MemberEdit = {};
  if (request.roleIds !== undefined) {
    await assertKnownRoles(tenantId, request.roleIds);
    edit.roleIds = combineRoles(
      member.roleIds ?? [],
      request.roleIds,
      request.mode ?? "replace",
    );
  }
  if (request.isTenantOwner !== undefined)
    edit.isTenantOwner = request.isTenantOwner;
  return { member, edit, changes: describeMemberEdit(member, edit) };
}

async function assertTenantOpen(tenantId: string): Promise<void> {
  const lifecycle = await observeTenantLifecycle(tenantId);
  if (lifecycle.closed) {
    throw new Error(`workspace "${tenantId}" is being deleted`);
  }
  if (lifecycle.barrierId !== null) {
    throw new Error(`member changes in workspace "${tenantId}" are paused`);
  }
}

/**
 * Sets a member's roles and owner flag with the checks of the members page:
 * lifecycle admission, `Hook.MEMBER_BEING_CHANGED` vetoes, the last-owner
 * check and the platform-owner mirror. Fires `dms.member-roles-changed` with
 * origin `automation` once written.
 */
export async function setMemberRoles(
  tenantId: string,
  userId: string,
  request: MemberRolesRequest,
): Promise<MemberRolesResult> {
  const change = await changeTenantMembers(tenantId, async () => {
    const { member, edit, changes } = await planMemberEdit(
      tenantId,
      userId,
      request,
    );
    return {
      changes,
      write: async (): Promise<MemberAccessChange> => {
        const before = memberAccess(member);
        if (changes.length === 0) return { before, after: before };
        await prepareOwnerChange(tenantId, before, edit.isTenantOwner);
        await GetModel(TenantMemberModel, tenantId).update(member._id, edit);
        return { before, after: editedAccess(member, edit) };
      },
    };
  });
  const result = rolesResult(change);
  if (result.changed) {
    notifyMenuAccessChanged(tenantId, [userId]);
    announceMemberChanges(tenantId, [change], "automation");
  }
  return result;
}

/**
 * What {@link setMemberRoles} would answer, with its core checks and no
 * write: no admission is taken and no `Hook.MEMBER_BEING_CHANGED` handler
 * runs.
 */
export async function previewMemberRoles(
  tenantId: string,
  userId: string,
  request: MemberRolesRequest,
): Promise<MemberRolesResult> {
  const { member, edit } = await planMemberEdit(tenantId, userId, request);
  const before = memberAccess(member);
  if (detectOwnerChange(before, edit.isTenantOwner) === "demote")
    await assertNotLastTenantOwner(tenantId, before);
  await assertTenantOpen(tenantId);
  return rolesResult({ before, after: editedAccess(member, edit) });
}

/** Whether a removal removed a member, and whether they owned the tenant. */
export type MemberRemovalResult = {
  removed: boolean;
  userId: string;
  wasTenantOwner: boolean;
};

/**
 * Removes a user's membership with the checks of the members page's delete.
 * A user who is not a member answers `removed: false`.
 */
export async function removeTenantMember(
  tenantId: string,
  userId: string,
): Promise<MemberRemovalResult> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const result = await changeTenantMembers(tenantId, async () => {
    const member = await memberModel.getByUser(userId);
    if (!member) {
      return {
        changes: [],
        write: async (): Promise<MemberRemovalResult> => ({
          removed: false,
          userId,
          wasTenantOwner: false,
        }),
      };
    }
    return {
      changes: [describeMemberRemoval(member)],
      write: async (): Promise<MemberRemovalResult> => {
        await prepareMemberRemoval(tenantId, [member]);
        await memberModel.delete(member._id);
        return {
          removed: true,
          userId,
          wasTenantOwner: member.isTenantOwner === true,
        };
      },
    };
  });
  if (result.removed) notifyMenuAccessChanged(tenantId, [userId]);
  return result;
}

/**
 * What {@link removeTenantMember} would answer, with its owner checks and no
 * write, hook or admission.
 */
export async function previewMemberRemoval(
  tenantId: string,
  userId: string,
): Promise<MemberRemovalResult> {
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(userId);
  if (!member) return { removed: false, userId, wasTenantOwner: false };
  await assertTenantKeepsOwner(tenantId, [member]);
  await assertNotLastPlatformOwnerOnDelete([member]);
  await assertTenantOpen(tenantId);
  return {
    removed: true,
    userId,
    wasTenantOwner: member.isTenantOwner === true,
  };
}
