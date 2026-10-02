import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type Role,
  RoleModel,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { GetPermissions } from "@antelopejs/interface-dms/permissions";
import {
  GetCategoryPermissionIds,
  GetMenuOrder,
} from "../../../implementations/dms/page";
import type {
  RoleDeleteInput,
  RoleEditorInput,
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

/** Rename a role, change its description and its permissions. */
export async function updateRole(
  actor: RoleEditorActor,
  roleId: string,
  input: RoleEditorInput,
): Promise<void> {
  const role = await requireRole(actor.tenantId, roleId);
  await assertNameAvailable(actor.tenantId, input.name, roleId);
  role.name = input.name;
  role.description = input.description;
  role.permissions = [...new Set(input.permissions)];
  role.updatedAt = new Date();
  await GetModel(RoleModel, actor.tenantId).update(role);
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
 * nobody loses access by accident. The editor confirms and passes `force`.
 */
export async function assertRoleUnused(
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
 * Delete a role. Its members and invitations lose it, or move to
 * `reassignTo`; without `force` a role still held is refused.
 */
export async function deleteRole(
  actor: RoleEditorActor,
  roleId: string,
  input: RoleDeleteInput,
): Promise<void> {
  await requireRole(actor.tenantId, roleId);
  if (input.reassignTo) {
    assert(
      input.reassignTo !== roleId,
      HTTP_CONFLICT,
      INVALID_REASSIGN_MESSAGE,
    );
    await requireRole(actor.tenantId, input.reassignTo);
  }
  if (!input.force) await assertRoleUnused(actor.tenantId, roleId);
  await moveRoleHolders(actor.tenantId, roleId, input.reassignTo);
  await GetModel(RoleModel, actor.tenantId).delete(roleId);
}
