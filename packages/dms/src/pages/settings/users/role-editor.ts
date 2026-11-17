import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import type { Role } from "@antelopejs/interface-dms/db";
import { mapPermissionTree, permissionLabel } from "./permission-tree-nodes";

/** Members listed by name on a role before the rest collapse into a count. */
export const ROLE_MEMBER_PREVIEW_LIMIT = 3;

/** A permission of the roles editor tree, with what the editor explains about it. */
export interface RoleEditorPermissionNode {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  /** Permissions this one needs; granting it grants them too. */
  dependencies?: string[];
  /** What granting it really allows (see `declarePermissionWarning`). */
  warning?: string;
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
   * Permission ids of the tree the user holds, and so may grant; `null` for
   * the platform owner, who may grant any.
   */
  grantable: string[] | null;
  capabilities: RoleEditorCapabilities;
}

/** Who holds a role, as the database counted it. */
export interface RoleHolders {
  memberCount: number;
  /** The first `ROLE_MEMBER_PREVIEW_LIMIT` holders, in stored order. */
  previewUserIds: string[];
  /** Pending invitations that will give the role when accepted. */
  inviteCount: number;
}

/** What the role summaries are computed from. */
export interface RoleSummarySource {
  roles: Role[];
  /** The holders of each role, by role id. */
  holders: Map<string, RoleHolders>;
  userNames: Map<string, string>;
  knownPermissionIds: Set<string>;
}

/**
 * Map the registered permission tree to the roles editor nodes; `categoryIds`
 * leaves out the headings over nothing, `entryIds` keeps the pages filed under
 * an entry every member holds (see `mapPermissionTree`).
 */
export function mapRoleEditorTree(
  permissionTree: Record<string, PermissionTree>,
  categoryIds?: ReadonlySet<string>,
  entryIds?: ReadonlySet<string>,
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
    categoryIds,
    entryIds,
  );
}

/**
 * Id of the settings root (`settingsCategory`), stable like the interface's
 * own check of it. The roles editor lists what it holds last: the sidebar
 * shows it in its footer, after every other section.
 */
export const SETTINGS_ROOT_PERMISSION_ID = "settings";

function isUnderSettingsRoot(node: RoleEditorPermissionNode): boolean {
  return (
    node.id === SETTINGS_ROOT_PERMISSION_ID ||
    node.id.startsWith(`${SETTINGS_ROOT_PERMISSION_ID}.`)
  );
}

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
 * down, with the settings moved last.
 */
export function orderRoleEditorTree(
  nodes: RoleEditorPermissionNode[],
  menuOrder: Map<string, number>,
): RoleEditorPermissionNode[] {
  const ordered = orderBranch(nodes, menuOrder);
  return [
    ...ordered.filter((node) => !isUnderSettingsRoot(node)),
    ...ordered.filter(isUnderSettingsRoot),
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

function previewMembers(
  userIds: string[],
  userNames: Map<string, string>,
): RoleMemberPreview[] {
  return userIds.slice(0, ROLE_MEMBER_PREVIEW_LIMIT).map((userId) => ({
    userId,
    name: userNames.get(userId) ?? "",
  }));
}

function summarizeRole(role: Role, source: RoleSummarySource): RoleSummary {
  const holders = source.holders.get(role._id);
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
    memberCount: holders?.memberCount ?? 0,
    members: previewMembers(holders?.previewUserIds ?? [], source.userNames),
    inviteCount: holders?.inviteCount ?? 0,
  };
}

/** Summaries of the roles, sorted by name, with their members and invites. */
export function summarizeRoles(source: RoleSummarySource): RoleSummary[] {
  return [...source.roles]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((role) => summarizeRole(role, source));
}

/** The tenant owners, `ownerIds` in stored order, as the Owner entry of the roles list. */
export function summarizeOwners(
  ownerIds: string[],
  userNames: Map<string, string>,
): RoleOwnersSummary {
  return {
    memberCount: ownerIds.length,
    members: previewMembers(ownerIds, userNames),
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
