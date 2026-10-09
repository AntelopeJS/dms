import type {
  Permission,
  PermissionTree,
} from "@antelopejs/interface-dms/permissions";

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

const NO_IDS: ReadonlySet<string> = new Set();

/** The menu's permissions a mapping tells apart (see `mapPermissionTree`). */
interface MenuPermissionIds {
  categoryIds: ReadonlySet<string>;
  entryIds: ReadonlySet<string>;
}

/**
 * Map the registered permission tree to the nodes a permission editor renders.
 *
 * The tree is keyed by id segment, so a registered `media.upload` hangs under a
 * `media` node that carries no permission when `media` itself is not
 * registered. Such a node is not rendered, but its descendants are lifted to
 * its level instead of being dropped with it. A `defaultGranted` node hides
 * what hangs off it: under a public page, its component permissions nobody
 * needs to grant. A menu entry filed under it is another matter: when
 * `entryIds` names it, it is lifted to the node's level like the children of
 * an unregistered node — the settings root is held by every member, the
 * workspace pages under it still need a role.
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
  categoryIds: ReadonlySet<string> = NO_IDS,
  entryIds: ReadonlySet<string> = NO_IDS,
): TNode[] {
  const menu: MenuPermissionIds = { categoryIds, entryIds };
  return mapBranch(permissionTree, createNode, menu);
}

function mapBranch<TNode extends PermissionNodeShape<TNode>>(
  branch: Record<string, PermissionTree>,
  createNode: PermissionNodeFactory<TNode>,
  menu: MenuPermissionIds,
): TNode[] {
  return Object.values(branch).flatMap((node) =>
    mapPermissionTreeNode(node, createNode, menu),
  );
}

function mapPermissionTreeNode<TNode extends PermissionNodeShape<TNode>>(
  node: PermissionTree,
  createNode: PermissionNodeFactory<TNode>,
  menu: MenuPermissionIds,
): TNode[] {
  if (!node.data) {
    return mapBranch(node.children, createNode, menu);
  }
  if (node.data.defaultGranted) {
    return liftFiledEntries(node.children, createNode, menu);
  }

  const children = mapBranch(node.children, createNode, menu);
  if (children.length > 0) return [createNode(node.data, children)];
  if (isHeadingOverNothing(node.data.id, node, menu.categoryIds)) return [];
  return [createNode(node.data, undefined)];
}

// Below a node every member holds, keeps only the menu entries: the rest is
// its own components and actions.
function liftFiledEntries<TNode extends PermissionNodeShape<TNode>>(
  branch: Record<string, PermissionTree>,
  createNode: PermissionNodeFactory<TNode>,
  menu: MenuPermissionIds,
): TNode[] {
  return Object.values(branch).flatMap((node) => {
    if (!node.data) return liftFiledEntries(node.children, createNode, menu);
    if (!menu.entryIds.has(node.data.id)) return [];
    return mapPermissionTreeNode(node, createNode, menu);
  });
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
