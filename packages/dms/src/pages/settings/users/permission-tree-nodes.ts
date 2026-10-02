import type {
  Permission,
  PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import type { FormComponents } from "@antelopejs/interface-dms/base/form";

const UNTITLED_PERMISSION_LABEL = "Unknown Permission";

/** Node every permission tree mapping produces: a permission and its children. */
export interface PermissionNodeShape<TNode> {
  children?: TNode[];
}

/** Builds one rendered node from a registered permission and its mapped children. */
export type PermissionNodeFactory<TNode extends PermissionNodeShape<TNode>> = (
  permission: Permission,
  children: TNode[] | undefined,
) => TNode;

const NO_CATEGORIES: ReadonlySet<string> = new Set();

/**
 * Map the registered permission tree to the nodes a permission editor renders.
 *
 * The tree is keyed by id segment, so a registered `media.upload` hangs under a
 * `media` node that carries no permission when `media` itself is not
 * registered. Such a node is not rendered, but its descendants are lifted to
 * its level instead of being dropped with it. A `defaultGranted` node hides its
 * whole subtree: under a public page, that subtree is component permissions
 * nobody needs to grant.
 *
 * `categoryIds` names the permissions of the registered categories. A category
 * with permissions below it, every one of them hidden that way, is a heading
 * over nothing a role could be given — the built-in Pages root holding only
 * the public sign-in pages, in a project that files its own pages under a root
 * of its own — so it is left out, as the sidebar leaves out an empty heading.
 * A category with nothing registered below it stays: a dynamic menu provider
 * may fill it, and its permission is what guards those entries.
 */
export function mapPermissionTree<TNode extends PermissionNodeShape<TNode>>(
  permissionTree: Record<string, PermissionTree>,
  createNode: PermissionNodeFactory<TNode>,
  categoryIds: ReadonlySet<string> = NO_CATEGORIES,
): TNode[] {
  return Object.values(permissionTree).flatMap((node) =>
    mapPermissionTreeNode(node, createNode, categoryIds),
  );
}

function mapPermissionTreeNode<TNode extends PermissionNodeShape<TNode>>(
  node: PermissionTree,
  createNode: PermissionNodeFactory<TNode>,
  categoryIds: ReadonlySet<string>,
): TNode[] {
  if (!node.data) {
    return mapPermissionTree(node.children, createNode, categoryIds);
  }
  if (node.data.defaultGranted) return [];

  const children = mapPermissionTree(node.children, createNode, categoryIds);
  if (children.length > 0) return [createNode(node.data, children)];
  if (isHeadingOverNothing(node.data.id, node, categoryIds)) return [];
  return [createNode(node.data, undefined)];
}

// Called once nothing below the node is left to render: when it had
// permissions below it, all of them were hidden.
function isHeadingOverNothing(
  id: string,
  node: PermissionTree,
  categoryIds: ReadonlySet<string>,
): boolean {
  return categoryIds.has(id) && Object.keys(node.children).length > 0;
}

/** Label of a permission, for one registered without a title. */
export function permissionLabel(permission: Permission): string {
  return permission.title ?? UNTITLED_PERMISSION_LABEL;
}

/**
 * Map the registered permission tree to the nodes of the `PermissionsType`
 * form field (see {@link mapPermissionTree} for the lifting rules).
 */
export function mapPermissionTreeToPermissionNodes(
  permissionTree: Record<string, PermissionTree>,
  categoryIds: ReadonlySet<string> = NO_CATEGORIES,
): FormComponents.PermissionsTreeNode[] {
  return mapPermissionTree<FormComponents.PermissionsTreeNode>(
    permissionTree,
    (permission, children) => ({
      id: permission.id,
      label: permissionLabel(permission),
      icon: permission.icon,
      children,
    }),
    categoryIds,
  );
}
