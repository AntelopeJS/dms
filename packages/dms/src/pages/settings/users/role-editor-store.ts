import { HTTPResult } from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type Role,
  RoleModel,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { GetPermissions } from "@antelopejs/interface-dms/permissions";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  type ConfirmDialogSerialized,
  serializeConfirmDialog,
} from "@antelopejs/interface-dms/base/table-view";
import {
  GetCategoryPermissionIds,
  GetMenuOrder,
} from "../../../implementations/dms/page";
import { haveSameMembers } from "../../../utils/notification-rules";
import {
  type RoleEditorInput,
  roleDeleteSchema,
} from "../../../validation/role-editor.schema";
import {
  collectPermissionIds,
  countRoleHolders,
  mapRoleEditorTree,
  orderRoleEditorTree,
  replaceRoleReference,
  type RoleEditorCapabilities,
  type RoleEditorPermissionNode,
  type RolesOverview,
  summarizeOwners,
  summarizeRoles,
} from "./role-editor";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;

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
 * The roles editor tree built from the permissions registered right now,
 * ordered like the main menu.
 */
export async function loadRoleEditorTree(): Promise<
  RoleEditorPermissionNode[]
> {
  return orderRoleEditorTree(
    mapRoleEditorTree(await GetPermissions(), GetCategoryPermissionIds()),
    GetMenuOrder(),
  );
}

async function loadUserNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await GetModel(UserModel).getBy("_id", ...new Set(userIds));
  return new Map(users.map((user) => [user._id, user.name]));
}

/** The roles, the owners and what `actor` may change, for the roles page. */
export async function loadRolesOverview(
  actor: RoleEditorActor,
  capabilities: RoleEditorCapabilities,
): Promise<RolesOverview> {
  const [roles, members, invites, tree] = await Promise.all([
    GetModel(RoleModel, actor.tenantId).getAll(),
    GetModel(TenantMemberModel, actor.tenantId).listAll(),
    GetModel(UserInviteModel, actor.tenantId).getAll(),
    loadRoleEditorTree(),
  ]);
  const permissionIds = collectPermissionIds(tree);
  const userNames = await loadUserNames(members.map((member) => member.userId));
  return {
    roles: summarizeRoles({
      roles,
      members,
      invites,
      userNames,
      knownPermissionIds: new Set(permissionIds),
      now: new Date(),
    }),
    owners: summarizeOwners(members, userNames),
    totalPermissions: permissionIds.length,
    // Whoever may edit roles may grant any permission, as the roles table
    // always allowed (and `/api/tables/roles` still does).
    grantable: null,
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
  tenantId: string,
  input: RoleEditorInput,
): Promise<string> {
  const now = new Date();
  const [roleId] = await GetModel(RoleModel, tenantId).insert({
    name: input.name,
    description: input.description,
    permissions: [...new Set(input.permissions)],
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
  return insertRole(actor.tenantId, input);
}

/** What saving a role changed. */
export interface RoleUpdateResult {
  name: string;
  /** The permissions differ from the stored ones, not only the name or description. */
  permissionsChanged: boolean;
}

/** Rename a role, change its description and its permissions. */
export async function updateRole(
  actor: RoleEditorActor,
  roleId: string,
  input: RoleEditorInput,
): Promise<RoleUpdateResult> {
  const role = await requireRole(actor.tenantId, roleId);
  await assertNameAvailable(actor.tenantId, input.name, roleId);
  const permissions = [...new Set(input.permissions)];
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
  return insertRole(actor.tenantId, {
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
  const [members, invites] = await Promise.all([
    GetModel(TenantMemberModel, tenantId).listAll(),
    GetModel(UserInviteModel, tenantId).getAll(),
  ]);
  const holders = countRoleHolders(roleId, members, invites, new Date());
  assert(holders === 0, HTTP_CONFLICT, IN_USE_MESSAGE);
}

async function moveRoleHolders(
  tenantId: string,
  roleId: string,
  replacementId?: string,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const inviteModel = GetModel(UserInviteModel, tenantId);
  const [members, invites] = await Promise.all([
    memberModel.listAll(),
    inviteModel.getAll(),
  ]);
  for (const member of members) {
    const roleIds = replaceRoleReference(
      member.roleIds ?? [],
      roleId,
      replacementId,
    );
    if (roleIds) await memberModel.update(member._id, { roleIds });
  }
  for (const invite of invites) {
    const rolesIds = replaceRoleReference(
      invite.roles_ids ?? [],
      roleId,
      replacementId,
    );
    if (rolesIds) await inviteModel.update(invite._id, { roles_ids: rolesIds });
  }
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
  const [roles, members, invites] = await Promise.all([
    GetModel(RoleModel, tenantId).getAll(),
    GetModel(TenantMemberModel, tenantId).listAll(),
    GetModel(UserInviteModel, tenantId).getAll(),
  ]);
  const holders = countRoleHolders(roleId, members, invites, new Date());
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
  values: Record<string, unknown> | undefined,
): Promise<void> {
  if (!values) {
    for (const roleId of roleIds) await assertRoleUnused(tenantId, roleId);
    return;
  }
  const { reassignTo } = assertValidation(values, (v) =>
    roleDeleteSchema.parse(v),
  );
  if (reassignTo) {
    // Named after the field, so the delete dialog shows it under the role
    // picker rather than in its alert.
    if (roleIds.includes(reassignTo)) {
      throw new HTTPResult(HTTP_CONFLICT, {
        field: REASSIGN_FIELD,
        message: INVALID_REASSIGN_MESSAGE,
      });
    }
    await requireRole(tenantId, reassignTo);
  }
  for (const roleId of roleIds) {
    await moveRoleHolders(tenantId, roleId, reassignTo ?? undefined);
  }
}
