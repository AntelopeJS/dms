import { GetModel } from "@antelopejs/interface-database-decorators";
import { type Role, RoleModel } from "@antelopejs/interface-dms/db";
import {
  GetPermissions,
  type PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import {
  GetCategoryPermissionIds,
  GetMenuEntryPermissionIds,
} from "../../../implementations/dms/page";
import { mapPermissionTree } from "./permission-tree-nodes";
import {
  applyRoleWarnings,
  resolvePermissionWarnings,
} from "./permission-warnings";

/** A role offered in the invite dialog, with what it grants. */
export interface InviteRoleOption {
  _id: string;
  name: string;
  /** Grantable permissions of the role, the ones the roles editor lists. */
  permissionIds: string[];
  /**
   * Warnings declared on those permissions (see `declarePermissionWarning`):
   * the role amounts to owner-level access when there is one.
   */
  warnings?: string[];
}

interface GrantableNode {
  id: string;
  children?: GrantableNode[];
}

/** Roles the invite dialog offers, and how many permissions exist in all. */
export interface InviteRoleOptions {
  roles: InviteRoleOption[];
  totalPermissions: number;
}

/**
 * Every permission id a role can grant: the nodes the roles editor renders.
 * Read from `mapPermissionTree`, the mapping the editor uses — a node without
 * data is only a namespace, a `defaultGranted` node hides what hangs off it
 * but the menu entries filed under it, and a category over nothing is left
 * out — so "21 of 52" reads the same as the editor.
 */
export function collectGrantablePermissionIds(
  tree: Record<string, PermissionTree>,
  categoryIds?: ReadonlySet<string>,
  entryIds?: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  const collect = (nodes: GrantableNode[]): void => {
    for (const node of nodes) {
      ids.add(node.id);
      collect(node.children ?? []);
    }
  };
  collect(
    mapPermissionTree<GrantableNode>(
      tree,
      (permission, children) => ({ id: permission.id, children }),
      categoryIds,
      entryIds,
    ),
  );
  return ids;
}

/**
 * The roles of the tenant as the invite dialog offers them, sorted by name.
 * Stale ids a role still stores (a page that no longer exists) are left out of
 * its count.
 */
export function buildInviteRoleOptions(
  roles: Role[],
  tree: Record<string, PermissionTree>,
  categoryIds?: ReadonlySet<string>,
  entryIds?: ReadonlySet<string>,
): InviteRoleOptions {
  const grantable = collectGrantablePermissionIds(tree, categoryIds, entryIds);
  const options = roles
    .map((role) => ({
      _id: role._id,
      name: role.name,
      permissionIds: [...new Set(role.permissions ?? [])].filter((id) =>
        grantable.has(id),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { roles: options, totalPermissions: grantable.size };
}

/** The tenant's roles as the role pickers offer them. */
export async function loadRoleOptions(
  tenantId: string,
): Promise<InviteRoleOptions> {
  const roles = await GetModel(RoleModel, tenantId).getAll();
  const options = buildInviteRoleOptions(
    roles,
    await GetPermissions(),
    GetCategoryPermissionIds(),
    GetMenuEntryPermissionIds(),
  );
  return applyRoleWarnings(options, resolvePermissionWarnings());
}
