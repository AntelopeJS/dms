import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import type {
  Role,
  TenantMember,
  UserInvite,
} from "@antelopejs/interface-dms/db";
import { mapPermissionTree, permissionLabel } from "./permission-tree-nodes";

/** Members listed by name on a role before the rest collapse into a count. */
export const ROLE_MEMBER_PREVIEW_LIMIT = 3;

/** Permission set entry of the holders who may do anything (platform owners). */
export const ALL_PERMISSIONS = "*";

/** A permission of the roles editor tree, with what the editor explains about it. */
export interface RoleEditorPermissionNode {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  /** Permissions this one needs; granting it grants them too. */
  dependencies?: string[];
  children?: RoleEditorPermissionNode[];
}

/** A member shown on a role (avatar initials and name). */
export interface RoleMemberPreview {
  userId: string;
  name: string;
}

/** Everything the roles list shows about one role. */
export interface RoleSummary {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  /** Granted permissions that exist in the current permission tree. */
  permissionCount: number;
  memberCount: number;
  members: RoleMemberPreview[];
  /** Pending invitations that will give the role when accepted. */
  inviteCount: number;
}

/** The tenant owners, shown as the locked Owner entry of the roles list. */
export interface RoleOwnersSummary {
  memberCount: number;
  members: RoleMemberPreview[];
}

/** What the signed-in user may do on the roles page. */
export interface RoleEditorCapabilities {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Payload of the roles page: the roles, the owners and the tree size. */
export interface RolesOverview {
  roles: RoleSummary[];
  owners: RoleOwnersSummary;
  totalPermissions: number;
  /**
   * Permission ids the user may grant; `null` when they may grant any — always,
   * since holding the roles' edit action lets one grant every permission.
   */
  grantable: string[] | null;
  capabilities: RoleEditorCapabilities;
}

/** Rows the role summaries are computed from. */
export interface RoleSummarySource {
  roles: Role[];
  members: TenantMember[];
  invites: UserInvite[];
  userNames: Map<string, string>;
  knownPermissionIds: Set<string>;
  now: Date;
}

/** Map the registered permission tree to the roles editor nodes. */
export function mapRoleEditorTree(
  permissionTree: Record<string, PermissionTree>,
): RoleEditorPermissionNode[] {
  return mapPermissionTree<RoleEditorPermissionNode>(
    permissionTree,
    (permission, children) => ({
      id: permission.id,
      label: permissionLabel(permission),
      icon: permission.icon,
      description: permission.description,
      dependencies: permission.dependencies,
      children,
    }),
  );
}

/**
 * Id of the settings root (`settingsCategory`), stable like the interface's
 * own check of it. The roles editor lists it last: the sidebar shows it in
 * its footer, after every other section.
 */
export const SETTINGS_ROOT_PERMISSION_ID = "settings";

/**
 * Siblings in menu order: what is not a menu entry (components, actions)
 * first, in declaration order, then the pages and categories as the main
 * menu lists them.
 */
function sortSiblingsByMenuOrder(
  nodes: RoleEditorPermissionNode[],
  menuOrder: Map<string, number>,
): RoleEditorPermissionNode[] {
  const unlisted = nodes.filter((node) => !menuOrder.has(node.id));
  const listed = nodes
    .filter((node) => menuOrder.has(node.id))
    .sort(
      (left, right) =>
        (menuOrder.get(left.id) ?? 0) - (menuOrder.get(right.id) ?? 0),
    );
  return [...unlisted, ...listed];
}

function orderBranch(
  nodes: RoleEditorPermissionNode[],
  menuOrder: Map<string, number>,
): RoleEditorPermissionNode[] {
  return sortSiblingsByMenuOrder(nodes, menuOrder).map((node) =>
    node.children
      ? { ...node, children: orderBranch(node.children, menuOrder) }
      : node,
  );
}

/**
 * Order an editor tree like the main menu (see `GetMenuOrder`), every level
 * down, with the settings root moved last.
 */
export function orderRoleEditorTree(
  nodes: RoleEditorPermissionNode[],
  menuOrder: Map<string, number>,
): RoleEditorPermissionNode[] {
  const ordered = orderBranch(nodes, menuOrder);
  return [
    ...ordered.filter((node) => node.id !== SETTINGS_ROOT_PERMISSION_ID),
    ...ordered.filter((node) => node.id === SETTINGS_ROOT_PERMISSION_ID),
  ];
}

/** Every permission id of an editor tree, parents included. */
export function collectPermissionIds(
  nodes: RoleEditorPermissionNode[],
): string[] {
  return nodes.flatMap((node) => [
    node.id,
    ...collectPermissionIds(node.children ?? []),
  ]);
}

/** Number of granted permissions that the permission tree still knows. */
export function countKnownPermissions(
  permissions: string[],
  knownPermissionIds: Set<string>,
): number {
  return new Set(permissions.filter((id) => knownPermissionIds.has(id))).size;
}

/** Whether an invitation can still be accepted. */
export function isInvitePending(invite: UserInvite, now: Date): boolean {
  return new Date(invite.expiresAt).getTime() > now.getTime();
}

function previewMembers(
  members: TenantMember[],
  userNames: Map<string, string>,
): RoleMemberPreview[] {
  return members.slice(0, ROLE_MEMBER_PREVIEW_LIMIT).map((member) => ({
    userId: member.userId,
    name: userNames.get(member.userId) ?? "",
  }));
}

function membersHoldingRole(
  roleId: string,
  members: TenantMember[],
): TenantMember[] {
  return members.filter((member) => (member.roleIds ?? []).includes(roleId));
}

function pendingInvitesForRole(
  roleId: string,
  invites: UserInvite[],
  now: Date,
): UserInvite[] {
  return invites.filter(
    (invite) =>
      isInvitePending(invite, now) && (invite.roles_ids ?? []).includes(roleId),
  );
}

function summarizeRole(role: Role, source: RoleSummarySource): RoleSummary {
  const members = membersHoldingRole(role._id, source.members);
  const inviteCount = pendingInvitesForRole(
    role._id,
    source.invites,
    source.now,
  ).length;
  const permissions = role.permissions ?? [];
  return {
    _id: role._id,
    name: role.name,
    description: role.description ?? "",
    permissions,
    permissionCount: countKnownPermissions(
      permissions,
      source.knownPermissionIds,
    ),
    memberCount: members.length,
    members: previewMembers(members, source.userNames),
    inviteCount,
  };
}

/** Summaries of the roles, sorted by name, with their members and invites. */
export function summarizeRoles(source: RoleSummarySource): RoleSummary[] {
  return [...source.roles]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((role) => summarizeRole(role, source));
}

/** The tenant owners as the Owner entry of the roles list. */
export function summarizeOwners(
  members: TenantMember[],
  userNames: Map<string, string>,
): RoleOwnersSummary {
  const owners = members.filter((member) => member.isTenantOwner === true);
  return {
    memberCount: owners.length,
    members: previewMembers(owners, userNames),
  };
}

/**
 * The role list of a member or an invitation once a role is deleted, moving
 * it to `replacementId` when given. `undefined` means the list is unchanged.
 */
export function replaceRoleReference(
  roleIds: string[],
  deletedId: string,
  replacementId?: string,
): string[] | undefined {
  if (!roleIds.includes(deletedId)) return undefined;
  const remaining = roleIds.filter((id) => id !== deletedId);
  if (!replacementId || remaining.includes(replacementId)) return remaining;
  return [...remaining, replacementId];
}

/** Number of members and pending invitations still holding a role. */
export function countRoleHolders(
  roleId: string,
  members: TenantMember[],
  invites: UserInvite[],
  now: Date,
): number {
  return (
    membersHoldingRole(roleId, members).length +
    pendingInvitesForRole(roleId, invites, now).length
  );
}
