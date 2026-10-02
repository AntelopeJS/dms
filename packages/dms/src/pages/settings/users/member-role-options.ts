import type { Role } from "@antelopejs/interface-dms/db";
import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import { mapPermissionTree } from "./permission-tree-nodes";

/** A role offered in the invite dialog, with what it grants. */
export interface InviteRoleOption {
  _id: string;
  name: string;
  /** Grantable permissions of the role, the ones the roles editor lists. */
  permissionIds: string[];
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
 * data is only a namespace, a `defaultGranted` node hides its whole subtree
 * and a category over nothing is left out — so "21 of 52" reads the same as
 * the editor.
 */
export function collectGrantablePermissionIds(
  tree: Record<string, PermissionTree>,
  categoryIds?: ReadonlySet<string>,
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
): InviteRoleOptions {
  const grantable = collectGrantablePermissionIds(tree, categoryIds);
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
