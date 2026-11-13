import { randomInt } from "node:crypto";
import { z } from "zod";
import type { JsonObject, MockupIssue, MockupNode, MockupSpec } from "./model";
import { jsonPointer, pageIdSchema } from "./model";

/**
 * The block a note is about: the one node whose id is `block`, then down
 * through the one child whose id is each of `steps`. Without `page`, `block`
 * is an id anchoring stamped, unique in the whole spec, so the block follows
 * a move to another page and a page rename. With `page`, `block` is the id an
 * author wrote on a root of the page `page`. Several matches name no block,
 * nor does a missing page.
 */
export const blockAnchorSchema = z
  .object({
    block: z.string(),
    steps: z.array(z.string()),
    page: pageIdSchema.optional(),
  })
  .strict();
export type BlockAnchor = z.infer<typeof blockAnchorSchema>;

/** Where a node is now: the id of its page and its spec JSON pointer. */
export interface NodeSite {
  page: string;
  path: string;
}

/** The part of a node anchoring reads: its id and its children. A child that is no node leaves an empty slot, so indexes stay the spec's. */
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
 * The tree of `spec` as anchoring reads it, however wrong the rest of the
 * spec is: a node that is no object, or an id that is no string, leaves an
 * empty slot. Undefined when there is no spec.
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

/** An id anchoring gave a node that had none: the node's spec JSON pointer, and the id. */
export interface IdStamp {
  path: string;
  id: string;
}

/** What anchoring a node answers, and the id it stamped on the spec, if any. */
export interface Anchored {
  anchor: BlockAnchor;
  stamp?: IdStamp;
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
const STAMPED_ID = new RegExp(
  `^${STAMP_PREFIX}[${STAMP_ALPHABET}]{${STAMP_LENGTH}}$`,
);
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

function only<Item>(items: readonly Item[]): Item | undefined {
  return items.length === 1 ? items[0] : undefined;
}

function childWithId(from: Visit, id: string): Visit | undefined {
  const child = only(
    (from.node.children ?? []).flatMap((node, index) =>
      node?.id === id ? [{ node, index }] : [],
    ),
  );
  if (!child) return undefined;
  return {
    node: child.node,
    address: {
      page: from.address.page,
      indexes: [...from.address.indexes, child.index],
    },
  };
}

function findBlock(tree: BlockTree, anchor: BlockAnchor): Visit | undefined {
  const block = only(
    visitsOf(tree).filter(
      ({ node, address }) =>
        node.id === anchor.block &&
        (anchor.page === undefined ||
          (address.indexes.length === 1 &&
            tree.pages[address.page]?.id === anchor.page)),
    ),
  );
  return anchor.steps.reduce<Visit | undefined>(
    (visit, step) => visit && childWithId(visit, step),
    block,
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
 * Where the block `anchor` names is in `tree` now. Undefined when the block
 * is gone or cannot be told apart from another: see {@link BlockAnchor}.
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

/**
 * An issue at the `id` of each node whose id has the format anchoring stamps
 * and is the id of a node before it in document order: a copy of an
 * annotated block that kept its id, and would take the block's notes.
 */
export function stampedIdIssues(tree: BlockTree): MockupIssue[] {
  const first = new Map<string, string>();
  const issues: MockupIssue[] = [];
  for (const { node, address } of visitsOf(tree)) {
    if (node.id === undefined || !STAMPED_ID.test(node.id)) continue;
    const pointer = pointerOf(address);
    const earlier = first.get(node.id);
    if (earlier === undefined) first.set(node.id, pointer);
    else {
      issues.push({
        path: `${pointer}/id`,
        message: `another block, at ${earlier}, already has the id "${node.id}", which anchors its notes: give the copy a new id or none`,
      });
    }
  }
  return issues;
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

/** Whether a note can anchor on a node with this id: none yet, or one anchoring stamped that no other node of the spec carries. */
function isAnchorable(
  id: string | undefined,
  counts: ReadonlyMap<string, number>,
): boolean {
  return id === undefined || (STAMPED_ID.test(id) && counts.get(id) === 1);
}

function idCounts(tree: BlockTree): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { node } of visitsOf(tree)) {
    if (node.id !== undefined) {
      counts.set(node.id, (counts.get(node.id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Anchors the node `site` names in `spec` on the nearest node, from it up to
 * its root, that has no id or an id anchoring stamped that no other node
 * carries: a node with no id gets
 * a fresh one, stamped on `spec` in place. The ids authors wrote on the nodes
 * below it are the steps: siblings never share one. No id is ever renamed, so
 * when every node down to the target has an id an author wrote, the anchor is
 * those ids on the page of `site`. Undefined when `site` names no node of
 * `spec`.
 */
export function anchorSite(
  spec: MockupSpec,
  site: NodeSite,
): Anchored | undefined {
  const address = addressOfSite(spec, site);
  const chain = address && chainTo(spec, address);
  if (!address || !chain) return undefined;
  const counts = idCounts(spec);
  const depth = chain.findLastIndex(({ id }) => isAnchorable(id, counts));
  const steps = chain.slice(depth + 1).flatMap(({ id }) => id ?? []);
  if (depth < 0) {
    const [block, ...below] = steps;
    return { anchor: { block, steps: below, page: site.page } };
  }
  const id = chain[depth].id;
  if (id !== undefined) return { anchor: { block: id, steps } };
  const taken = new Set(counts.keys());
  const reached = {
    page: address.page,
    indexes: address.indexes.slice(0, depth + 1),
  };
  const stamp = { path: pointerOf(reached), id: freshId(taken) };
  stampNode(spec, reached, stamp.id);
  return { anchor: { block: stamp.id, steps }, stamp };
}
