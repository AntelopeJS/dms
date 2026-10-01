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

/**
 * Map the registered permission tree to the nodes a permission editor renders.
 *
 * The tree is keyed by id segment, so a registered `media.upload` hangs under a
 * `media` node that carries no permission when `media` itself is not
 * registered. Such a node is not rendered, but its descendants are lifted to
 * its level instead of being dropped with it. A `defaultGranted` node hides its
 * whole subtree: under a public page, that subtree is component permissions
 * nobody needs to grant.
 */
export function mapPermissionTree<TNode extends PermissionNodeShape<TNode>>(
  permissionTree: Record<string, PermissionTree>,
  createNode: PermissionNodeFactory<TNode>,
): TNode[] {
  return Object.values(permissionTree).flatMap((node) =>
    mapPermissionTreeNode(node, createNode),
  );
}

function mapPermissionTreeNode<TNode extends PermissionNodeShape<TNode>>(
  node: PermissionTree,
  createNode: PermissionNodeFactory<TNode>,
): TNode[] {
  if (!node.data) return mapPermissionTree(node.children, createNode);
  if (node.data.defaultGranted) return [];

  const children = mapPermissionTree(node.children, createNode);
  return [createNode(node.data, children.length > 0 ? children : undefined)];
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
): FormComponents.PermissionsTreeNode[] {
  return mapPermissionTree<FormComponents.PermissionsTreeNode>(
    permissionTree,
    (permission, children) => ({
      id: permission.id,
      label: permissionLabel(permission),
      icon: permission.icon,
      children,
    }),
  );
}
