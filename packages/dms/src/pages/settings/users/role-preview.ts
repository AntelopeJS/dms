import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import { ALL_PERMISSIONS } from "./role-editor";

/** Separator of permission ids and of layout paths. */
const ID_SEPARATOR = ".";

/**
 * Action ids that only read what the block shows (table `list`, `view`…).
 * A block keeping them while losing every other action is read only.
 */
const READ_ACTION_IDS = new Set(["list", "view", "details", "read"]);

function isReadAction(permissionId: string): boolean {
  return READ_ACTION_IDS.has(permissionId.split(ID_SEPARATOR).at(-1) ?? "");
}

/**
 * One component of the previewed page, at the position the layout gives it.
 * `path` is what the browser can rebuild from the layout it renders (the
 * component key, then each child id); `permissionId` is the id the server
 * filters that position by.
 */
export interface RolePreviewLayoutNode {
  path: string;
  permissionId: string;
  /** Ids of the component's own actions (its permission children that are not child components). */
  actionIds: string[];
  children: RolePreviewLayoutNode[];
}

/** What a preview does to one block of the page. */
export type RolePreviewBlock =
  | { state: "hidden" }
  | {
      /**
       * `readonly`: every action beyond reading is withheld; `limited`: some
       * of the viewer's actions are, but not all of those.
       */
      state: "readonly" | "limited";
      /** Titles of the withheld actions (i18n keys or plain text). */
      withheld: string[];
    };

/** Which ids each permission set grants, decided beforehand by `HasPermission`. */
export interface RolePreviewGrants {
  /** Ids the signed-in user really holds. */
  real: ReadonlySet<string>;
  /** Ids the previewed role would hold. */
  preview: ReadonlySet<string>;
  /**
   * Ids every member holds whatever their role (`defaultGranted`): no role
   * changes them, so they never make a block read only or limited.
   */
  universal?: ReadonlySet<string>;
}

/** The page a preview runs on, as the browser identifies it. */
export interface RolePreviewPage {
  fullId: string;
  displayName: string;
  /** Whether the previewed role could open the page at all. */
  hidden: boolean;
}

/** Answer of the roles preview endpoint. */
export interface RolePreviewResult {
  page: RolePreviewPage | null;
  /** Blocks of the page keyed by layout path; absent blocks are unchanged. */
  blocks: Record<string, RolePreviewBlock>;
  /** Menu entries (`fullId`) the user can open that the role could not. */
  hiddenEntries: string[];
  /**
   * Menu entries (`fullId`) the role opens without everything the user has
   * there: a page where it loses a block or an action, a group holding such
   * a page or one it could not open.
   */
  partialEntries: string[];
  /** Header actions of the page (ids) the user is shown and the role would not be. */
  hiddenHeaderActions: string[];
  /** Quick actions (`category:id`) the user is served and the role would not be. */
  hiddenQuickActions: string[];
  /** Permissions of the role outside the user's own access, which cannot be previewed. */
  outOfScope: number;
}

/**
 * The permission set a preview runs with: the role's ids as saving would
 * store them, with every id they sit under, and the owner wildcard dropped —
 * a role never grants it, so a preview that carried it would show the
 * platform owner's view instead of the role's.
 */
export function sanitizePreviewPermissions(permissions: string[]): Set<string> {
  return new Set(
    withPermissionAncestors(permissions).filter(
      (id) => id.length > 0 && id !== ALL_PERMISSIONS,
    ),
  );
}

/** The registered permission node of an id, or `undefined`. */
export function findPermissionNode(
  tree: Record<string, PermissionTree>,
  permissionId: string,
): PermissionTree | undefined {
  const [head, ...rest] = permissionId.split(ID_SEPARATOR);
  let node = head === undefined ? undefined : tree[head];
  for (const part of rest) {
    if (!node) return undefined;
    node = node.children[part];
  }
  return node;
}

/** Registered direct children of a permission: its actions and child components. */
export function listPermissionChildren(
  tree: Record<string, PermissionTree>,
  permissionId: string,
): string[] {
  const node = findPermissionNode(tree, permissionId);
  if (!node) return [];
  return Object.values(node.children)
    .map((child) => child.data?.id)
    .filter((id): id is string => !!id);
}

function joinId(parent: string, id: string): string {
  return `${parent}${ID_SEPARATOR}${id}`;
}

function collectNode(
  component: ComponentInfoSerialized,
  path: string,
  permissionId: string,
  childrenOf: (permissionId: string) => string[],
): RolePreviewLayoutNode {
  const children = (component.children ?? []).map((child) =>
    collectNode(
      child.component,
      joinId(path, child.id),
      joinId(permissionId, child.id),
      childrenOf,
    ),
  );
  const childIds = new Set(children.map((child) => child.permissionId));
  return {
    path,
    permissionId,
    actionIds: childrenOf(permissionId).filter((id) => !childIds.has(id)),
    children,
  };
}

/**
 * The components of a served page layout with the permission id of each
 * position — the same ids `filterComponents` checks — and their actions.
 *
 * @param childrenOf Registered direct children of a permission id.
 */
export function collectPreviewLayout(
  components: Record<string, ComponentInfoSerialized>,
  pagePermissionId: string,
  childrenOf: (permissionId: string) => string[],
): RolePreviewLayoutNode[] {
  return Object.entries(components).map(([key, component]) =>
    collectNode(component, key, joinId(pagePermissionId, key), childrenOf),
  );
}

/** Every permission id a preview of these blocks has to decide. */
export function listPreviewPermissionIds(
  nodes: RolePreviewLayoutNode[],
): string[] {
  return nodes.flatMap((node) => [
    node.permissionId,
    ...node.actionIds,
    ...listPreviewPermissionIds(node.children),
  ]);
}

function classifyNode(
  node: RolePreviewLayoutNode,
  grants: RolePreviewGrants,
  titleOf: (permissionId: string) => string,
  blocks: Record<string, RolePreviewBlock>,
): void {
  // Only what the viewer is served is ever classified: the layout was
  // filtered by their own permissions, and an action they lack is no change.
  if (!grants.preview.has(node.permissionId)) {
    // Its children sit under the same veil; one per hidden branch is enough.
    blocks[node.path] = { state: "hidden" };
    return;
  }
  const held = node.actionIds.filter(
    (id) => grants.real.has(id) && !grants.universal?.has(id),
  );
  const withheld = held.filter((id) => !grants.preview.has(id));
  if (withheld.length > 0) {
    const writes = held.filter((id) => !isReadAction(id));
    const keepsWrite = writes.some((id) => grants.preview.has(id));
    blocks[node.path] = {
      state: writes.length > 0 && !keepsWrite ? "readonly" : "limited",
      withheld: withheld.map(titleOf),
    };
  }
  for (const child of node.children) {
    classifyNode(child, grants, titleOf, blocks);
  }
}

/**
 * What a previewed permission set changes on the blocks the viewer is served:
 * a block the role could not see is `hidden`; one it sees without some of the
 * viewer's actions is `readonly` when nothing beyond reading is left, else
 * `limited`. A page the role could not open hides every block.
 *
 * @param titleOf Title of a permission, shown for withheld actions.
 */
export function classifyPreviewBlocks(
  nodes: RolePreviewLayoutNode[],
  grants: RolePreviewGrants,
  pageHidden: boolean,
  titleOf: (permissionId: string) => string = (id) => id,
): Record<string, RolePreviewBlock> {
  const blocks: Record<string, RolePreviewBlock> = {};
  for (const node of nodes) {
    if (pageHidden) {
      blocks[node.path] = { state: "hidden" };
      continue;
    }
    classifyNode(node, grants, titleOf, blocks);
  }
  return blocks;
}

/**
 * Number of the role's permissions the viewer does not hold. Those are left
 * out of the preview: it only ever shows what the viewer can already see.
 */
export function countOutOfScope(
  preview: ReadonlySet<string>,
  realHolds: (permissionId: string) => boolean,
): number {
  return [...preview].filter((id) => !realHolds(id)).length;
}

/**
 * Whether a previewed role loses anything on a page it can open: a block
 * hidden, read only or limited, or a header action. Its menu entry is then
 * drawn partially locked.
 */
export function losesOnPreviewPage(
  blocks: Record<string, RolePreviewBlock>,
  hiddenHeaderActions: readonly string[],
): boolean {
  return hiddenHeaderActions.length > 0 || Object.keys(blocks).length > 0;
}
