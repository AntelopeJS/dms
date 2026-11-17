import type { BlockNode } from "@antelopejs/interface-dms-builder";
import { sameBlock } from "./apply-options";
import type { MockupNode } from "./model";
import { SKETCH_TYPE } from "./sketch";

/** A block of the live page, beside the node the page converts it to now. */
export interface BlockEntry {
  kind: "block";
  block: BlockNode;
  node: MockupNode;
  parent: BlockEntry | undefined;
  /**
   * Whether `node` stands for the block's whole subtree: a sketch, which
   * draws none of its children, or a node that dropped some.
   */
  whole: boolean;
  /** The blocks held in its options, which its node draws first among its children. */
  held: HeldEntry[];
  children: BlockEntry[];
}

/** A block held in an option of its parent (`{ $block }`), its node a child of the parent's. */
interface HeldEntry {
  kind: "held";
  /** The option's key, and its node's id. */
  name: string;
  /** Its parent's builder path and the option's key, as the conversion names it. */
  path: string;
  node: MockupNode;
  parent: BlockEntry;
}

type LiveEntry = BlockEntry | HeldEntry;

/** Where a node sits: the page's top level, under a live block, or under a block written new. */
export type Place = "root" | "fresh" | BlockEntry;

/** A node of the spec standing for a live block. */
interface Claim {
  entry: LiveEntry;
  node: MockupNode;
  pointer: string;
  /** The node's parent in the spec; undefined at the page's top level. */
  parent: MockupNode | undefined;
}

/** Which node stands for which live block, each at most once. */
export interface Matching {
  roots: BlockEntry[];
  byNode: Map<MockupNode, LiveEntry>;
  byEntry: Map<LiveEntry, Claim>;
  /** Each node's parent in the spec; undefined at the page's top level. */
  parents: Map<MockupNode, MockupNode | undefined>;
}

/** A name the page reader lists a top-level block under: it skips a static that starts with `_`. */
const LISTED_NAME = /^[A-Za-z$][\w$]*$/;
const NOT_NAME_CHARACTERS = /[^\w$]+/g;
/** The statics every class has: a block declared under one does not typecheck. */
const FUNCTION_MEMBERS = new Set([
  "arguments",
  "caller",
  "length",
  "name",
  "prototype",
]);

function isListed(name: string): boolean {
  return LISTED_NAME.test(name) && !FUNCTION_MEMBERS.has(name);
}

/**
 * The name a block written for a node with id `id` takes: the id itself when
 * the builder writes and lists a block under it at any place, else one made
 * from it that it does, so the next apply finds the block again. `b-1a2b3c4d`
 * gives `b_1a2b3c4d`; `_draft` gives `block_draft`; `name` gives `block_name`.
 */
export function blockNameOf(id: string): string {
  if (isListed(id)) return id;
  const word = id.replaceAll(NOT_NAME_CHARACTERS, "_");
  if (isListed(word)) return word;
  return `block${word.startsWith("_") ? "" : "_"}${word}`;
}

export function isSketch(node: MockupNode): boolean {
  return node.type === SKETCH_TYPE;
}

function nameOf(entry: LiveEntry): string {
  return entry.kind === "block" ? entry.block.name : entry.name;
}

/**
 * Whether `node` can stand for `entry`: a Custom sketch stands only for a
 * block the page draws as one, whose source the builder cannot write again.
 */
function canStandFor(node: MockupNode, entry: LiveEntry): boolean {
  return !isSketch(node) || isSketch(entry.node);
}

/**
 * The entry of `entries` that `node` stands for: one named its id, else its
 * id's block name; of those, the one the node still draws, else one drawn as
 * the node is (a sketch or not), else the first.
 */
function pick(
  entries: readonly LiveEntry[],
  node: MockupNode,
  id: string,
  free: (entry: LiveEntry) => boolean,
): LiveEntry | undefined {
  const fits = entries.filter(
    (entry) => free(entry) && canStandFor(node, entry),
  );
  const named =
    [id, blockNameOf(id)]
      .map((name) => fits.filter((entry) => nameOf(entry) === name))
      .find((found) => found.length > 0) ?? [];
  return (
    named.find((entry) => sameBlock(node, entry.node)) ??
    named.find((entry) => isSketch(entry.node) === isSketch(node)) ??
    named[0]
  );
}

function entryOf(
  block: BlockNode,
  node: MockupNode,
  parent: BlockEntry | undefined,
): BlockEntry {
  const blocks = block.children ?? [];
  const nodes = node.children ?? [];
  const whole = isSketch(node) || nodes.length < blocks.length;
  const entry: BlockEntry = {
    kind: "block",
    block,
    node,
    parent,
    whole,
    held: [],
    children: [],
  };
  if (whole) return entry;
  const heldCount = nodes.length - blocks.length;
  entry.held = nodes.slice(0, heldCount).map((held) => ({
    kind: "held",
    name: held.id ?? "",
    path: `${block.path}/${held.id ?? ""}`,
    node: held,
    parent: entry,
  }));
  entry.children = entriesOf(blocks, nodes.slice(heldCount), entry);
  return entry;
}

function entriesOf(
  blocks: readonly BlockNode[],
  nodes: readonly MockupNode[],
  parent: BlockEntry | undefined,
): BlockEntry[] {
  return blocks.flatMap((block, index) =>
    index < nodes.length ? [entryOf(block, nodes[index], parent)] : [],
  );
}

/** The live blocks at a place, held ones aside. */
export function blocksAt(place: Place, roots: BlockEntry[]): BlockEntry[] {
  if (place === "fresh") return [];
  return place === "root" ? roots : place.children;
}

/** The live entries one place offers its nodes, held blocks first. */
function candidatesAt(place: Place, roots: BlockEntry[]): LiveEntry[] {
  const held = place === "fresh" || place === "root" ? [] : place.held;
  return [...held, ...blocksAt(place, roots)];
}

function everyBlock(entries: readonly BlockEntry[]): BlockEntry[] {
  return entries.flatMap((entry) => [entry, ...everyBlock(entry.children)]);
}

type Finder = (
  node: MockupNode,
  id: string,
  place: Place,
) => LiveEntry | undefined;

/** Visits the spec tree parents first, each node with the place its parent's claim gives it. */
function claimTree(
  nodes: readonly MockupNode[],
  pointer: string,
  parent: MockupNode | undefined,
  matching: Matching,
  find: Finder,
): void {
  const place = placeUnder(parent, matching);
  nodes.forEach((node, index) => {
    const at = `${pointer}/${index}`;
    matching.parents.set(node, parent);
    if (!matching.byNode.has(node) && node.id !== undefined) {
      const entry = find(node, node.id, place);
      if (entry) {
        matching.byNode.set(node, entry);
        matching.byEntry.set(entry, { entry, node, pointer: at, parent });
      }
    }
    claimTree(node.children ?? [], `${at}/children`, node, matching, find);
  });
}

/** The place a node's children sit in: under its live block, or written new. */
export function placeUnder(
  parent: MockupNode | undefined,
  matching: Matching,
): Place {
  if (parent === undefined) return "root";
  const entry = matching.byNode.get(parent);
  return entry?.kind === "block" ? entry : "fresh";
}

/**
 * Pairs each node of `tree` with the live block it stands for, named its id
 * or its id's block name ({@link blockNameOf}): first among the children of
 * the block its parent stands for, over the whole tree; then, for a node left
 * over, a free block of that name anywhere on the page, which the mockup
 * moved: the one the node still draws first, then one drawn as it is, then
 * the first in page order. A Custom sketch stands only for a block the page
 * draws as one, so a block the builder cannot write again is left without a
 * node only when no sketch of its name is left without a block. `reconverted` is the page converted now, one node
 * per block: it pairs each block with the node it would be had the mockup
 * left it alone.
 */
export function matchTree(
  blocks: readonly BlockNode[],
  reconverted: readonly MockupNode[],
  tree: readonly MockupNode[],
  pointer: string,
): Matching {
  const roots = entriesOf(blocks, reconverted, undefined);
  const matching: Matching = {
    roots,
    byNode: new Map(),
    byEntry: new Map(),
    parents: new Map(),
  };
  const free = (entry: LiveEntry) => !matching.byEntry.has(entry);
  const inPlace: Finder = (node, id, place) =>
    pick(candidatesAt(place, roots), node, id, free);
  claimTree(tree, pointer, undefined, matching, inPlace);
  const anywhere = everyBlock(roots);
  claimTree(
    tree,
    pointer,
    undefined,
    matching,
    (node, id, place) =>
      inPlace(node, id, place) ?? pick(anywhere, node, id, free),
  );
  return matching;
}

/** The place a live block sits in on the page. */
export function livePlace(entry: BlockEntry): Place {
  return entry.parent ?? "root";
}
