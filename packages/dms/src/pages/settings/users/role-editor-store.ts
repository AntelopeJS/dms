import { HTTPResult } from "@antelopejs/interface-api";
import type {
  AfterWrite,
  DeleteGuardArgs,
} from "@antelopejs/interface-dms/base/types/guards";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type Role,
  RoleModel,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { withRequiredPermissions } from "@antelopejs/interface-dms/internal/permission-requirements";
import {
  GetPermissions,
  GrantsEveryPermission,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { changeTenantMembers } from "@antelopejs/interface-dms/tenant-members";
import { describeMemberEdit } from "@antelopejs/interface-dms/internal/member-changes";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  type ConfirmDialogSerialized,
  serializeConfirmDialog,
} from "@antelopejs/interface-dms/base/table-view";
import {
  GetCategoryPermissionIds,
  GetMenuEntryPermissionIds,
  GetMenuOrder,
  notifyMenuAccessChanged,
} from "../../../implementations/dms/page";
import { haveSameMembers } from "../../../utils";
import { type RoleEditorInput, roleDeleteSchema } from "../../../validation";
import {
  applyPermissionWarnings,
  resolvePermissionWarnings,
} from "./permission-warnings";
import {
  countRoleHolders,
  invitesGrantingRole,
  membersHoldingRole,
  pendingInvitesGrantingRole,
} from "../../../db";
import {
  collectPermissionIds,
  mapRoleEditorTree,
  orderRoleEditorTree,
  replaceRoleReference,
  type RoleEditorCapabilities,
  type RoleHolders,
  type RoleEditorPermissionNode,
  ROLE_MEMBER_PREVIEW_LIMIT,
  type RolesOverview,
  summarizeOwners,
  summarizeRoles,
} from "./role-editor";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;

const UNGRANTABLE_MESSAGE = "$page.settings.roles.error.ungrantable";
const ROLE_NOT_FOUND_MESSAGE = "$page.settings.roles.error.not_found";
const NAME_TAKEN_MESSAGE = "$page.settings.roles.error.name_taken";
const IN_USE_MESSAGE = "$page.settings.roles.error.in_use";
const INVALID_REASSIGN_MESSAGE = "$page.settings.roles.error.invalid_reassign";
const NOT_CREATED_MESSAGE = "$page.settings.roles.error.not_created";
const DELETE_I18N = "$page.settings.roles.editor";
/** The field of the delete dialog naming the role the holders move to. */
export const REASSIGN_FIELD = "reassignTo";

/** Who is editing the roles of which tenant. */
export interface RoleEditorActor {
  tenantId: string;
  permissions: Set<string>;
}

/**
 * Refuses a role that would hold `*`, which only the platform owner holds, or
 * a permission of `permissions` that `actor` does not hold. `kept` are the
 * permissions the role holds already: an edit may leave them in place.
 */
export async function assertGrantable(
  actor: RoleEditorActor,
  permissions: string[],
  kept: string[] = [],
): Promise<void> {
  const added = permissions.filter((id) => !kept.includes(id));
  const held = await Promise.all(
    added.map((id) => HasPermission(actor.permissions, id)),
  );
  assert(
    !GrantsEveryPermission(new Set(permissions)) && held.every(Boolean),
    HTTP_FORBIDDEN,
    UNGRANTABLE_MESSAGE,
  );
}

/**
 * The roles editor tree built from the permissions registered right now,
 * ordered like the main menu, with the warnings declared on them.
 */
export async function loadRoleEditorTree(): Promise<
  RoleEditorPermissionNode[]
> {
  const tree = orderRoleEditorTree(
    mapRoleEditorTree(
      await GetPermissions(),
      GetCategoryPermissionIds(),
      GetMenuEntryPermissionIds(),
    ),
    GetMenuOrder(),
  );
  return applyPermissionWarnings(tree, resolvePermissionWarnings());
}

/**
 * The ids of `permissionIds` that `actor` may grant, as `assertGrantable`
 * decides; `null` when its effective permissions grant every permission, as
 * the platform owner's do, since it may then grant every one.
 */
async function grantablePermissionIds(
  actor: RoleEditorActor,
  permissionIds: string[],
): Promise<string[] | null> {
  if (GrantsEveryPermission(actor.permissions)) return null;
  const held = await Promise.all(
    permissionIds.map((id) => HasPermission(actor.permissions, id)),
  );
  return permissionIds.filter((_, index) => held[index]);
}

async function loadUserNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await GetModel(UserModel).getBy("_id", ...new Set(userIds));
  return new Map(users.map((user) => [user._id, user.name]));
}

async function loadRoleHolders(
  tenantId: string,
  roleId: string,
  now: Date,
): Promise<RoleHolders> {
  const members = GetModel(TenantMemberModel, tenantId);
  const [memberCount, preview, inviteCount] = await Promise.all([
    membersHoldingRole(members, roleId).count().run(),
    membersHoldingRole(members, roleId)
      .slice(0, ROLE_MEMBER_PREVIEW_LIMIT)
      .pluck("userId")
      .run(),
    pendingInvitesGrantingRole(GetModel(UserInviteModel, tenantId), roleId, now)
      .count()
      .run(),
  ]);
  return {
    memberCount,
    previewUserIds: preview.map((member) => member.userId),
    inviteCount,
  };
}

/** The roles, the owners and what `actor` may change, for the roles page. */
export async function loadRolesOverview(
  actor: RoleEditorActor,
  capabilities: RoleEditorCapabilities,
): Promise<RolesOverview> {
  const now = new Date();
  const [roles, owners, tree] = await Promise.all([
    GetModel(RoleModel, actor.tenantId).getAll(),
    GetModel(TenantMemberModel, actor.tenantId).listOwners(),
    loadRoleEditorTree(),
  ]);
  const ownerIds = owners.map((owner) => owner.userId);
  const holders = new Map(
    await Promise.all(
      roles.map(async (role): Promise<[string, RoleHolders]> => [
        role._id,
        await loadRoleHolders(actor.tenantId, role._id, now),
      ]),
    ),
  );
  const previewed = [
    ...ownerIds.slice(0, ROLE_MEMBER_PREVIEW_LIMIT),
    ...[...holders.values()].flatMap((role) => role.previewUserIds),
  ];
  const permissionIds = collectPermissionIds(tree);
  const [userNames, grantable] = await Promise.all([
    loadUserNames(previewed),
    grantablePermissionIds(actor, permissionIds),
  ]);
  return {
    roles: summarizeRoles({
      roles,
      holders,
      userNames,
      knownPermissionIds: new Set(permissionIds),
    }),
    owners: summarizeOwners(ownerIds, userNames),
    totalPermissions: permissionIds.length,
    grantable,
    capabilities,
  };
}

async function requireRole(tenantId: string, roleId: string): Promise<Role> {
  const role = await GetModel(RoleModel, tenantId).get(roleId);
  assert(role, HTTP_NOT_FOUND, ROLE_NOT_FOUND_MESSAGE);
  return role;
}

async function assertNameAvailable(
  tenantId: string,
  name: string,
  roleId?: string,
): Promise<void> {
  const existing = await GetModel(RoleModel, tenantId).getByName(name);
  assert(
    !existing || existing._id === roleId,
    HTTP_CONFLICT,
    NAME_TAKEN_MESSAGE,
  );
}

async function insertRole(
  actor: RoleEditorActor,
  input: RoleEditorInput,
): Promise<string> {
  const permissions = await withRequiredPermissions(input.permissions);
  await assertGrantable(actor, permissions);
  const now = new Date();
  const [roleId] = await GetModel(RoleModel, actor.tenantId).insert({
    name: input.name,
    description: input.description,
    permissions,
    createdAt: now,
    updatedAt: now,
  });
  assert(roleId, HTTP_INTERNAL_ERROR, NOT_CREATED_MESSAGE);
  return roleId;
}

/** Create a role; returns its id. */
export async function createRole(
  actor: RoleEditorActor,
  input: RoleEditorInput,
): Promise<string> {
  await assertNameAvailable(actor.tenantId, input.name);
  return insertRole(actor, input);
}

/** What saving a role changed. */
export interface RoleUpdateResult {
  name: string;
  /** The permissions differ from the stored ones, not only the name or description. */
  permissionsChanged: boolean;
}

/**
 * Rename a role, change its description and its permissions, completed like
 * a new role's (see `insertRole`).
 */
export async function updateRole(
  actor: RoleEditorActor,
  roleId: string,
  input: RoleEditorInput,
): Promise<RoleUpdateResult> {
  const role = await requireRole(actor.tenantId, roleId);
  await assertNameAvailable(actor.tenantId, input.name, roleId);
  const permissions = await withRequiredPermissions(input.permissions);
  await assertGrantable(actor, permissions, role.permissions);
  const permissionsChanged = !haveSameMembers(
    role.permissions ?? [],
    permissions,
  );
  role.name = input.name;
  role.description = input.description;
  role.permissions = permissions;
  role.updatedAt = new Date();
  await GetModel(RoleModel, actor.tenantId).update(role);
  return { name: role.name, permissionsChanged };
}

/** Copy a role under a new name; returns the id of the copy. */
export async function duplicateRole(
  actor: RoleEditorActor,
  roleId: string,
  name: string,
): Promise<string> {
  const role = await requireRole(actor.tenantId, roleId);
  await assertNameAvailable(actor.tenantId, name);
  const permissions = role.permissions ?? [];
  return insertRole(actor, {
    name,
    description: role.description ?? "",
    permissions,
  });
}

/**
 * Refuse deleting a role that members or pending invitations still hold, so
 * nobody loses access by accident.
 */
async function assertRoleUnused(
  tenantId: string,
  roleId: string,
): Promise<void> {
  const holders = await countRoleHolders(
    GetModel(TenantMemberModel, tenantId),
    GetModel(UserInviteModel, tenantId),
    roleId,
    new Date(),
  );
  assert(holders === 0, HTTP_CONFLICT, IN_USE_MESSAGE);
}

/** The users holding `roleId` in the tenant. */
export async function listRoleHolderIds(
  tenantId: string,
  roleId: string,
): Promise<string[]> {
  const holders = await membersHoldingRole(
    GetModel(TenantMemberModel, tenantId),
    roleId,
  )
    .pluck("userId")
    .run();
  return holders.map((holder) => holder.userId);
}

/** Moves the holders of `roleId` to `replacementId`; returns the members moved. */
async function moveRoleHolders(
  tenantId: string,
  roleId: string,
  replacementId?: string,
): Promise<string[]> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const inviteModel = GetModel(UserInviteModel, tenantId);
  return changeTenantMembers(tenantId, async () => {
    const [memberRows, inviteRows] = await Promise.all([
      membersHoldingRole(memberModel, roleId).run(),
      invitesGrantingRole(inviteModel, roleId).run(),
    ]);
    const members = memberRows.flatMap(
      (row) => TenantMemberModel.fromDatabase(row) ?? [],
    );
    const invites = inviteRows.flatMap(
      (row) => UserInviteModel.fromDatabase(row) ?? [],
    );
    const memberMoves = members.flatMap((member) => {
      const roleIds = replaceRoleReference(
        member.roleIds ?? [],
        roleId,
        replacementId,
      );
      return roleIds ? [{ member, roleIds }] : [];
    });
    return {
      changes: memberMoves.flatMap(({ member, roleIds }) =>
        describeMemberEdit(member, { roleIds }),
      ),
      write: async () => {
        for (const { member, roleIds } of memberMoves) {
          await memberModel.update(member._id, { roleIds });
        }
        for (const invite of invites) {
          const rolesIds = replaceRoleReference(
            invite.roles_ids ?? [],
            roleId,
            replacementId,
          );
          if (rolesIds)
            await inviteModel.update(invite._id, { roles_ids: rolesIds });
        }
        return memberMoves.map(({ member }) => member.userId);
      },
    };
  });
}

/**
 * The dialog asking to delete a role (`confirm.from` of the editor's delete):
 * how many members and pending invitations still hold it, and the role to
 * move them to, picked in the dialog.
 */
export async function loadRoleDeleteConfirm(
  tenantId: string,
  roleId: string,
): Promise<ConfirmDialogSerialized> {
  const role = await requireRole(tenantId, roleId);
  const [roles, holders] = await Promise.all([
    GetModel(RoleModel, tenantId).getAll(),
    countRoleHolders(
      GetModel(TenantMemberModel, tenantId),
      GetModel(UserInviteModel, tenantId),
      roleId,
      new Date(),
    ),
  ]);
  const otherRoles = roles.filter((candidate) => candidate._id !== roleId);
  return serializeConfirmDialog({
    title: `${DELETE_I18N}.delete_title`,
    description:
      holders > 0
        ? `${DELETE_I18N}.delete_in_use`
        : `${DELETE_I18N}.delete_unused`,
    params: { name: role.name, count: holders },
    icon: "i-ph-trash",
    color: "error",
    confirmLabel: `${DELETE_I18N}.delete_confirm`,
    cancelLabel: `${DELETE_I18N}.cancel`,
    fields:
      holders > 0
        ? [
            {
              id: REASSIGN_FIELD,
              label: `${DELETE_I18N}.reassign_label`,
              type: new DefaultDataTypes.SelectType({
                items: otherRoles.map(({ _id, name }) => ({
                  value: _id,
                  label: name,
                })),
                placeholder: `${DELETE_I18N}.reassign_none`,
                deselectable: true,
              }),
            },
          ]
        : undefined,
  });
}

/**
 * Readies roles for the table's delete, as its guard. With no dialog
 * answered (`values` unset), a role members or invitations still hold is
 * refused, so a bare API call strips nobody's access; once the delete dialog
 * was confirmed, their holders move to `reassignTo`, or just lose the role.
 */
export async function prepareRoleDeletion(
  tenantId: string,
  roleIds: string[],
  values: DeleteGuardArgs["values"],
): Promise<AfterWrite | undefined> {
  if (!values) {
    for (const roleId of roleIds) await assertRoleUnused(tenantId, roleId);
    return undefined;
  }
  const { reassignTo } = assertValidation(values, (v) =>
    roleDeleteSchema.parse(v),
  );
  if (reassignTo) {
    if (roleIds.includes(reassignTo)) {
      throw new HTTPResult(HTTP_CONFLICT, {
        field: REASSIGN_FIELD,
        message: INVALID_REASSIGN_MESSAGE,
      });
    }
    await requireRole(tenantId, reassignTo);
  }
  const holders: string[] = [];
  for (const roleId of roleIds) {
    holders.push(
      ...(await moveRoleHolders(tenantId, roleId, reassignTo ?? undefined)),
    );
  }

  return () => notifyMenuAccessChanged(tenantId, holders);
}
