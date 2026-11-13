import type { BlockNode } from "@antelopejs/interface-dms-builder";
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

export function isSketch(node: MockupNode): boolean {
  return node.type === SKETCH_TYPE;
}

function nameOf(entry: LiveEntry): string {
  return entry.kind === "block" ? entry.block.name : entry.name;
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

/** The live entries one place offers its nodes, held blocks first. */
function candidatesAt(place: Place, roots: BlockEntry[]): LiveEntry[] {
  if (place === "fresh") return [];
  if (place === "root") return roots;
  return [...place.held, ...place.children];
}

function everyBlock(entries: readonly BlockEntry[]): BlockEntry[] {
  return entries.flatMap((entry) => [entry, ...everyBlock(entry.children)]);
}

type Finder = (node: MockupNode, place: Place) => LiveEntry | undefined;

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
      const entry = find(node, place);
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
 * Pairs each node of `tree` with the live block it stands for, by
 * `node.id === block.name`: first among the children of the block its
 * parent stands for, over the whole tree; then, for a node left over, the
 * one free block of that name anywhere on the page, which the mockup moved.
 * `reconverted` is the page converted now, one node per block: it pairs each
 * block with the node it would be had the mockup left it alone.
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
  const inPlace: Finder = (node, place) =>
    candidatesAt(place, roots).find(
      (entry) => free(entry) && nameOf(entry) === node.id,
    );
  claimTree(tree, pointer, undefined, matching, inPlace);
  const named = everyBlock(roots);
  claimTree(tree, pointer, undefined, matching, (node, place) => {
    const here = inPlace(node, place);
    if (here) return here;
    const moved = named.filter(
      (entry) => free(entry) && entry.block.name === node.id,
    );
    return moved.length === 1 ? moved[0] : undefined;
  });
  return matching;
}

/** The place a live block sits in on the page. */
export function livePlace(entry: BlockEntry): Place {
  return entry.parent ?? "root";
}
