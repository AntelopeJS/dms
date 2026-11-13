import { randomInt } from "node:crypto";
import { z } from "zod";
import type { JsonObject, MockupNode, MockupSpec } from "./model";
import { jsonPointer } from "./model";

/**
 * The block a note is about: the node whose id is `block`, then down through
 * the children whose ids are `steps`.
 */
export const blockAnchorSchema = z
  .object({ block: z.string(), steps: z.array(z.string()) })
  .strict();
export type BlockAnchor = z.infer<typeof blockAnchorSchema>;

/** Where a node is now: the id of its page and its spec JSON pointer. */
export interface NodeSite {
  page: string;
  path: string;
}

/** The part of a node anchoring reads: its id and its children, a slot kept for each one. */
interface TreeNode {
  id?: string;
  children?: ReadonlyArray<TreeNode | undefined>;
}

/** What anchoring reads of a spec: a {@link MockupSpec} is one. */
export interface BlockTree {
  pages: ReadonlyArray<
    { id?: string; tree: ReadonlyArray<TreeNode | undefined> } | undefined
  >;
}

const nodeViewSchema: z.ZodType<TreeNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string().optional().catch(undefined),
    children: z.array(nodeViewSchema.optional().catch(undefined)).catch([]),
  }),
);

const treeViewSchema = z.object({
  pages: z
    .array(
      z
        .object({
          id: z.string().optional().catch(undefined),
          tree: z.array(nodeViewSchema.optional().catch(undefined)).catch([]),
        })
        .optional()
        .catch(undefined),
    )
    .catch([]),
});

/**
 * What `spec` holds of a spec, however wrong the rest of it is: a value that
 * is no node, or an id that is no string, is a slot with nothing in it.
 * Undefined when there is no spec object.
 */
export function viewOf(spec: JsonObject | undefined): BlockTree | undefined {
  const parsed = treeViewSchema.safeParse(spec);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Where a node is in a spec: the index of its page, then the index of its
 * root in the page's tree, then of each child down to it.
 */
interface NodeAddress {
  page: number;
  indexes: number[];
}

/** What anchoring a node answers, and whether it stamped an id on the spec. */
export interface Anchored {
  anchor: BlockAnchor;
  stamped: boolean;
}

interface Visit {
  node: TreeNode;
  address: NodeAddress;
}

const INDEX = "(0|[1-9][0-9]*)";
const NODE_POINTER = new RegExp(
  `^/pages/${INDEX}/tree/${INDEX}((?:/children/${INDEX})*)$`,
);
const CHILDREN_SEGMENT = "/children/";

const STAMP_PREFIX = "b-";
const STAMP_LENGTH = 8;
const STAMP_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TRAILING_NUMBER = /-\d+$/;

function subtree(node: TreeNode, address: NodeAddress): Visit[] {
  const children = (node.children ?? []).flatMap((child, index) =>
    child
      ? subtree(child, {
          page: address.page,
          indexes: [...address.indexes, index],
        })
      : [],
  );
  return [{ node, address }, ...children];
}

/** Every node of `tree` in document order: pages in order, each tree depth first. */
function visitsOf(tree: BlockTree): Visit[] {
  return tree.pages.flatMap((page, pageIndex) =>
    (page?.tree ?? []).flatMap((root, index) =>
      root ? subtree(root, { page: pageIndex, indexes: [index] }) : [],
    ),
  );
}

function childWithId(from: Visit, id: string): Visit | undefined {
  const children = from.node.children ?? [];
  const index = children.findIndex((child) => child?.id === id);
  const node = index < 0 ? undefined : children[index];
  if (!node) return undefined;
  return {
    node,
    address: {
      page: from.address.page,
      indexes: [...from.address.indexes, index],
    },
  };
}

function findBlock(tree: BlockTree, anchor: BlockAnchor): Visit | undefined {
  const first = visitsOf(tree).find(({ node }) => node.id === anchor.block);
  return anchor.steps.reduce<Visit | undefined>(
    (visit, step) => visit && childWithId(visit, step),
    first,
  );
}

/** The spec JSON pointer of the node at `address`. */
function pointerOf({ page, indexes }: NodeAddress): string {
  const [root, ...children] = indexes;
  return jsonPointer([
    "pages",
    page,
    "tree",
    root,
    ...children.flatMap((index) => ["children", index]),
  ]);
}

/**
 * Where the block `anchor` names is in `tree` now: the first node with its
 * id in document order, then the children its steps name. Undefined when the
 * block is gone.
 */
export function locateBlock(
  tree: BlockTree,
  anchor: BlockAnchor,
): NodeSite | undefined {
  const found = findBlock(tree, anchor);
  const page = found && tree.pages[found.address.page]?.id;
  return found && page !== undefined
    ? { page, path: pointerOf(found.address) }
    : undefined;
}

function addressOfSite(
  tree: BlockTree,
  site: NodeSite,
): NodeAddress | undefined {
  const match = NODE_POINTER.exec(site.path);
  if (!match) return undefined;
  const [, page, root, children] = match;
  const address = {
    page: Number(page),
    indexes: [
      Number(root),
      ...children.split(CHILDREN_SEGMENT).slice(1).map(Number),
    ],
  };
  return tree.pages[address.page]?.id === site.page ? address : undefined;
}

/** The chain of nodes from a root of a page's tree down to the node at `address`. */
function chainTo(
  tree: BlockTree,
  address: NodeAddress,
): TreeNode[] | undefined {
  let list = tree.pages[address.page]?.tree ?? [];
  const chain: TreeNode[] = [];
  for (const index of address.indexes) {
    const node = list[index];
    if (!node) return undefined;
    chain.push(node);
    list = node.children ?? [];
  }
  return chain;
}

function freshId(taken: ReadonlySet<string>): string {
  for (;;) {
    const body = Array.from(
      { length: STAMP_LENGTH },
      () => STAMP_ALPHABET[randomInt(STAMP_ALPHABET.length)],
    ).join("");
    const id = `${STAMP_PREFIX}${body}`;
    if (!taken.has(id) && !TRAILING_NUMBER.test(id)) return id;
  }
}

function stampNode(spec: MockupSpec, address: NodeAddress, id: string): void {
  const [root, ...children] = address.indexes;
  let node: MockupNode | undefined = spec.pages[address.page]?.tree[root];
  for (const index of children) node = node?.children?.[index];
  if (node) node.id = id;
}

/**
 * Anchors the node `site` names in `spec`, walking up from it. A node with
 * no id gets a fresh one, stamped on `spec` in place, and anchors there. A
 * node whose id already leads back to the target anchors there. Any other id
 * joins the steps and the walk goes to the parent: no existing id is ever
 * renamed. A root whose id leads elsewhere anchors anyway, so it names the
 * first node with that id. Undefined when `site` names no node of `spec`.
 */
export function anchorSite(
  spec: MockupSpec,
  site: NodeSite,
): Anchored | undefined {
  const address = addressOfSite(spec, site);
  const chain = address && chainTo(spec, address);
  if (!address || !chain) return undefined;
  const taken = new Set(visitsOf(spec).flatMap(({ node }) => node.id ?? []));
  const target = pointerOf(address);
  let steps: string[] = [];
  for (let depth = chain.length - 1; ; depth -= 1) {
    const id = chain[depth].id;
    const reached = {
      page: address.page,
      indexes: address.indexes.slice(0, depth + 1),
    };
    if (id === undefined) {
      const stamp = freshId(taken);
      stampNode(spec, reached, stamp);
      return { anchor: { block: stamp, steps }, stamped: true };
    }
    const anchor = { block: id, steps };
    const found = findBlock(spec, anchor);
    if (depth === 0 || (found && pointerOf(found.address) === target)) {
      return { anchor, stamped: false };
    }
    steps = [id, ...steps];
  }
}
