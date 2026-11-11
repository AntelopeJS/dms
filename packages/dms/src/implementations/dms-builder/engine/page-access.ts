import { Schema } from "@antelopejs/interface-database";
import type { Permission, PermissionTree } from "@antelopejs/interface-dms";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { BlockNode } from "@antelopejs/interface-dms-builder";
import { buildPageBlocks } from "./block-tree";
import { isString } from "./scalar-guards";
import { getBooleanProperty } from "./literals";
import { readPermissionTree } from "./permissions";
import type { PageRecord } from "./scan";
import { findPageRecord } from "./source-index";

/** A role holding it holds every permission there is. */
const ALL_PERMISSIONS = "*";
const ID_SEPARATOR = ".";

/**
 * How the roles of a workspace reach a page:
 * - `blocks`: a role opens the page with its permission, and every block of it
 *   with a permission of the block's own, named after where the block sits;
 * - `page`: the page's permission is the only one (`noComponentPermissions`);
 * - `everyone`: every member reaches it, blocks included, without a role;
 * - `unmanaged`: no role is asked — a module's page is its owner's, an
 *   `authOnly` one anyone's signed in, and a page the DMS has not registered
 *   yet is nobody's to say.
 */
type PageAccessMode = "blocks" | "page" | "everyone" | "unmanaged";

/** An action of a block a role can be granted or not: export, delete… */
interface BlockAction {
  id: string;
  title: string;
}

/** A role of the workspace, with what it holds of the page. */
export interface RoleAccess {
  id: string;
  name: string;
  /** How many members hold it. */
  members: number;
  /** Whether it holds every permission there is. */
  all: boolean;
  /** The permissions it holds under the page, the page's own included. */
  permissions: string[];
}

/**
 * Who reaches a page and each of its blocks, as the DMS decides it: what the
 * builder needs to say which roles a block it adds, renames or moves is shown
 * to — a block's permission is named after where it sits, so every one of
 * those gestures hands it a permission no role holds yet.
 */
export interface PageAccess {
  mode: PageAccessMode;
  /** The page's id in the DMS, which its permission defaults to. */
  fullId: string;
  /** The permission the page opens under, as saved. */
  permission: string;
  /** The actions of each saved block, by the block's permission. */
  actions: Record<string, BlockAction[]>;
  /**
   * The blocks each saved block holds through its settings — a card's chart —
   * which the DMS gives a permission of their own, under the holder's.
   */
  held: Record<string, BlockAction[]>;
  /** The permissions under the page every member holds without a role. */
  granted: string[];
  /** The workspace's roles; null when they could not be read. */
  roles: RoleAccess[] | null;
}

function pageFullId(record: PageRecord): string {
  return record.categoryRef
    ? `${record.categoryRef}${ID_SEPARATOR}${record.id}`
    : record.id;
}

/** The page's permission: the one it names, else one named after it. */
function pagePermissionId(record: PageRecord): string {
  const named = record.permission?.id;
  return isString(named) && named.length > 0 ? named : pageFullId(record);
}

/** A permission's node: the tree is keyed by the segments of the ids. */
function findPermissionNode(
  tree: Record<string, PermissionTree>,
  id: string,
): PermissionTree | undefined {
  const [head, ...rest] = id.split(ID_SEPARATOR);
  let node =
    head !== undefined && Object.hasOwn(tree, head) ? tree[head] : undefined;
  for (const part of rest) {
    node =
      node && Object.hasOwn(node.children, part)
        ? node.children[part]
        : undefined;
  }
  return node;
}

function accessMode(
  record: PageRecord,
  node: PermissionTree | undefined,
): PageAccessMode {
  if (!node?.data) {
    return "unmanaged";
  }
  if (node.data.defaultGranted) {
    return "everyone";
  }
  const options = record.optionsNode;
  if (
    options &&
    getBooleanProperty(options, "noComponentPermissions") === true
  ) {
    return "page";
  }
  return "blocks";
}

/** A block held through a setting: the engine reads it back as `{ $block }`. */
function isHeldBlock(value: unknown): value is { $block: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "$block" in value
  );
}

/** What the DMS registered under a block's permission, besides its children. */
export interface BlockAccess {
  actions: Record<string, BlockAction[]>;
  held: Record<string, BlockAction[]>;
}

/**
 * The actions of each block, and the blocks it holds through its settings:
 * what the DMS registered under the block's permission that is not a block it
 * holds as a child. A block set up in code is skipped — what it holds is not
 * read, so its children would pass for actions.
 */
export function blockAccess(
  blocks: BlockNode[],
  parentId: string,
  tree: Record<string, PermissionTree>,
  found: BlockAccess = { actions: {}, held: {} },
): BlockAccess {
  for (const block of blocks) {
    const id = `${parentId}${ID_SEPARATOR}${block.name}`;
    if (!block.editable) {
      continue;
    }
    const children = new Set(
      (block.children ?? []).map(
        (child) => `${id}${ID_SEPARATOR}${child.name}`,
      ),
    );
    const held = new Set(
      Object.entries(block.config ?? {})
        .filter(([, value]) => isHeldBlock(value))
        .map(([key]) => `${id}${ID_SEPARATOR}${key}`),
    );
    const registered = Object.values(
      findPermissionNode(tree, id)?.children ?? {},
    )
      .map((child) => child.data)
      .filter(
        (data): data is Permission =>
          data !== undefined && !children.has(data.id),
      )
      .map((data) => ({ id: data.id, title: data.title }));
    const actions = registered.filter((entry) => !held.has(entry.id));
    const parts = registered.filter((entry) => held.has(entry.id));
    if (actions.length > 0) {
      found.actions[id] = actions;
    }
    if (parts.length > 0) {
      found.held[id] = parts;
    }
    blockAccess(block.children ?? [], id, tree, found);
  }
  return found;
}

function collectGranted(node: PermissionTree | undefined, found: string[]) {
  for (const child of Object.values(node?.children ?? {})) {
    if (child.data?.defaultGranted) {
      found.push(child.data.id);
    }
    collectGranted(child, found);
  }
}

/**
 * Who reaches the page, from the DMS's permission tree and the roles read. A
 * page the scan cannot read keeps its access; its actions go unsaid.
 */
export function describePageAccess(
  record: PageRecord,
  tree: Record<string, PermissionTree>,
  roles: RoleAccess[] | null,
): PageAccess {
  const permission = pagePermissionId(record);
  const node = findPermissionNode(tree, permission);
  let blocks: BlockNode[] = [];
  try {
    blocks = buildPageBlocks(record);
  } catch {}
  const { actions, held } = blockAccess(blocks, permission, tree);
  const granted: string[] = [];
  collectGranted(node, granted);
  return {
    mode: accessMode(record, node),
    fullId: pageFullId(record),
    permission,
    actions,
    held,
    granted,
    roles,
  };
}

/**
 * The roles of the tenant, each with what it holds under `prefixes`, and how
 * many members hold it. Null when they cannot be read: no tenant on the
 * request, no database, a DMS that registers its tables elsewhere.
 */
async function readRoles(
  tenant: string | undefined,
  prefixes: string[],
): Promise<RoleAccess[] | null> {
  const { schemaName } = RoleModel;
  if (!tenant || schemaName === undefined) {
    return null;
  }
  const schema = Schema.get(schemaName);
  if (!schema) {
    return null;
  }
  const under = (id: string): boolean =>
    prefixes.some(
      (prefix) => id === prefix || id.startsWith(`${prefix}${ID_SEPARATOR}`),
    );
  try {
    const database = schema.instance(tenant);
    const [roles, members] = await Promise.all([
      new RoleModel(database).getAll(),
      new TenantMemberModel(database).getAll(),
    ]);
    const holders = new Map<string, number>();
    for (const member of members) {
      for (const roleId of member.roleIds ?? []) {
        holders.set(roleId, (holders.get(roleId) ?? 0) + 1);
      }
    }
    return roles
      .map((role) => {
        const held = role.permissions ?? [];
        return {
          id: String(role._id),
          name: role.name,
          members: holders.get(String(role._id)) ?? 0,
          all: held.includes(ALL_PERMISSIONS),
          permissions: held.filter(under),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return null;
  }
}

/**
 * Who reaches the page at `ref`, at the request's tenant. `also` is another
 * permission the page may be given — the one the draft picked — whose grants
 * are read too, so the editor can say who would open it before it is saved.
 * Undefined for a page the scan does not know.
 */
export async function pageAccess(
  ref: string,
  tenant: string | undefined,
  also?: string,
): Promise<PageAccess | undefined> {
  const record = findPageRecord(ref);
  if (!record) {
    return undefined;
  }
  const tree = (await readPermissionTree()) ?? {};
  const prefixes = [pagePermissionId(record)];
  if (also && also !== prefixes[0] && findPermissionNode(tree, also)?.data) {
    prefixes.push(also);
  }
  return describePageAccess(record, tree, await readRoles(tenant, prefixes));
}
