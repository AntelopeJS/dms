import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import type { FormComponents } from "@antelopejs/interface-dms/base/form";

/**
 * Map the registered permission tree to the nodes the roles editor renders.
 *
 * The tree is keyed by id segment, so a registered `media.upload` hangs under a
 * `media` node that carries no permission when `media` itself is not
 * registered. Such a node is not rendered, but its descendants are lifted to
 * its level instead of being dropped with it. A `defaultGranted` node hides its
 * whole subtree: under a public page, that subtree is component permissions
 * nobody needs to grant.
 */
export function mapPermissionTreeToPermissionNodes(
  permissionTree: Record<string, PermissionTree>,
): FormComponents.PermissionsTreeNode[] {
  return Object.values(permissionTree).flatMap(mapPermissionTreeNode);
}

function mapPermissionTreeNode(
  node: PermissionTree,
): FormComponents.PermissionsTreeNode[] {
  if (!node.data) return mapPermissionTreeToPermissionNodes(node.children);
  if (node.data.defaultGranted) return [];

  const children = mapPermissionTreeToPermissionNodes(node.children);

  return [
    {
      id: node.data.id,
      label: node.data.title ?? "Unknown Permission",
      icon: node.data.icon,
      children: children.length > 0 ? children : undefined,
    },
  ];
}
