import type {
  BlockDraft,
  BlockNode,
  ConfigObject,
} from "@antelopejs/interface-dms-builder";
import type { IdStamp } from "./anchor";
import type { WiringNote, WiringReason } from "./apply-notes";
import {
  type BlockEntry,
  isSketch,
  livePlace,
  type Matching,
  placeUnder,
} from "./apply-match";
import {
  liveOptionsOf,
  ordered,
  placementOf,
  sameBlock,
  tableOptionsOf,
} from "./apply-options";
import type { NodeOracle } from "./compile";
import type { MockupNode } from "./model";

/** What becomes of a live block its node still stands for, at its place. */
export type Fate =
  | { kind: "preserve"; reason?: WiringReason }
  | { kind: "write"; type: string; config: ConfigObject };

/** A block as the builder writes it: its type and its options. */
export interface Written {
  type: string;
  config: ConfigObject;
}

/** A node as a block the builder writes, or why it cannot be one. */
export type Writable =
  | { ok: true; block: Written }
  | { ok: false; reason: WiringReason };

export type Placement = Pick<BlockDraft, "slot" | "meta">;

/** A node written new that had no id, the name it was written under as its id, and its type. */
export type NodeStamp = IdStamp & { type: string };

/** What a plan reads, and what it has decided so far. */
export interface Planner {
  readonly matching: Matching;
  readonly routes: Readonly<Record<string, string>>;
  readonly oracle: NodeOracle;
  readonly fates: Map<BlockEntry, Fate>;
  readonly anchored: Map<BlockEntry, boolean>;
  /**
   * The name each node written new would take at its place. A node missing
   * from it, with an id, has the name of another block there: see `namePlaces`.
   */
  readonly names: Map<MockupNode, string>;
  /** The moved blocks that stay where they were, their nodes not written. */
  stuck: ReadonlySet<BlockEntry>;
  /** The outermost blocks kept as they were at their place, each with a stuck block inside. */
  stays: ReadonlyMap<BlockEntry, BlockEntry>;
  readonly wiring: WiringNote[];
  readonly stamps: NodeStamp[];
}

export function placed(
  slot: string | undefined,
  meta: ConfigObject | undefined,
): Placement {
  const placement: Placement = {};
  if (slot !== undefined) placement.slot = slot;
  if (meta !== undefined) placement.meta = meta;
  return placement;
}

/**
 * A live block written back as it is. A block with locked options lists its
 * children as they are too: the builder checks their place against its source.
 */
export function preservedDraft(
  block: BlockNode,
  placement: Placement,
): BlockDraft {
  const draft: BlockDraft = { name: block.name, preserve: true, ...placement };
  if (block.lockedOptions && block.children?.length) {
    draft.children = block.children.map((child) =>
      preservedDraft(child, placed(child.slot, child.meta)),
    );
  }
  return draft;
}

export function note(
  p: Planner,
  node: MockupNode,
  pointer: string,
  reason: WiringReason,
  kept?: string,
): void {
  p.wiring.push({
    pointer,
    ...(node.id !== undefined && { id: node.id }),
    ...(node.type !== undefined && { type: node.type }),
    reason,
    ...(kept !== undefined && { kept }),
  });
}

/** Whether a claimed block keeps its path: its node sits under its parent's, up to the top. */
export function isAnchored(p: Planner, entry: BlockEntry): boolean {
  const known = p.anchored.get(entry);
  if (known !== undefined) return known;
  const claim = p.matching.byEntry.get(entry);
  const anchored =
    claim !== undefined &&
    placeUnder(claim.parent, p.matching) === livePlace(entry) &&
    (entry.parent === undefined || isAnchored(p, entry.parent));
  p.anchored.set(entry, anchored);
  return anchored;
}

/** Whether the mockup put a live block under another parent than its own. */
export function isMoveRoot(p: Planner, entry: BlockEntry): boolean {
  const claim = p.matching.byEntry.get(entry);
  return (
    claim !== undefined &&
    placeUnder(claim.parent, p.matching) !== livePlace(entry)
  );
}

/** The options holding a block, as the live block has them: a mockup never writes one. */
function heldConfig(entry: BlockEntry): ConfigObject {
  const config = entry.block.config ?? {};
  return Object.fromEntries(
    entry.held.flatMap((held) =>
      Object.hasOwn(config, held.name) ? [[held.name, config[held.name]]] : [],
    ),
  );
}

function sketchFate(node: MockupNode, live: MockupNode): Fate {
  if (sameBlock(node, live)) return { kind: "preserve" };
  if (isSketch(node) && isSketch(live)) {
    return { kind: "preserve", reason: "custom-component" };
  }
  return { kind: "preserve", reason: isSketch(live) ? "type" : "locked" };
}

/** Whether a block with locked options keeps its type and its children's places, as its source holds them. */
function keepsSource(p: Planner, entry: BlockEntry, node: MockupNode): boolean {
  const placedChildren = (node.children ?? []).filter(
    (child) => p.matching.byNode.get(child)?.kind !== "held",
  );
  const liveChildren = entry.children.map((child) => child.node);
  return (
    node.type === entry.node.type &&
    placementOf(placedChildren) === placementOf(liveChildren)
  );
}

function tableFate(p: Planner, entry: BlockEntry, node: MockupNode): Fate {
  const { block, node: live } = entry;
  const type = live.type;
  if (type === undefined || node.type !== type) {
    return { kind: "preserve", reason: "table" };
  }
  const options = tableOptionsOf(
    node.options ?? {},
    live.options ?? {},
    block,
    p.routes,
  );
  return options.ok
    ? { kind: "write", type, config: options.config }
    : { kind: "preserve", reason: options.reason };
}

/** `node` as a block of the builder's own types, with the options its live block takes. */
function written(p: Planner, entry: BlockEntry, node: MockupNode): Writable {
  if (node.type === undefined || p.oracle.kindOf(node.type) !== "block") {
    return { ok: false, reason: "type" };
  }
  const options = liveOptionsOf(
    node.options ?? {},
    p.routes,
    entry.node.options,
    entry.block.lockedOptions,
  );
  if (!options.ok) return options;
  const config = { ...options.config, ...heldConfig(entry) };
  return {
    ok: true,
    block: { type: node.type, config: ordered(entry.block.config, config) },
  };
}

function decideFate(p: Planner, entry: BlockEntry, node: MockupNode): Fate {
  if (entry.whole) return sketchFate(node, entry.node);
  if (isSketch(node)) return { kind: "preserve", reason: "custom-component" };
  if (sameBlock(node, entry.node)) return { kind: "preserve" };
  if (entry.block.lockedOptions && !keepsSource(p, entry, node)) {
    return { kind: "preserve", reason: "locked" };
  }
  if (p.oracle.kindOf(entry.node.type ?? "") === "controller") {
    return tableFate(p, entry, node);
  }
  const write = written(p, entry, node);
  return write.ok
    ? { kind: "write", ...write.block }
    : { kind: "preserve", reason: write.reason };
}

/**
 * What becomes of a block its node stands for in place: kept as it is when
 * nothing of it changed, when it is a sketch, or when the change is one only
 * code or data wiring can make; else written with the node's options.
 */
export function fateOf(p: Planner, entry: BlockEntry, node: MockupNode): Fate {
  const known = p.fates.get(entry);
  if (known) return known;
  const fate = decideFate(p, entry, node);
  p.fates.set(entry, fate);
  return fate;
}

/** The held blocks of `entry` whose nodes changed or are gone. */
export function changedHeld(p: Planner, entry: BlockEntry): BlockEntry["held"] {
  return entry.held.filter((held) => {
    const claim = p.matching.byEntry.get(held);
    return claim === undefined || !sameBlock(claim.node, held.node);
  });
}

/**
 * A moved block as a new block at its new place, and its name there, when
 * the builder can write all of it there under a name no other block has.
 */
export function copyOf(
  p: Planner,
  entry: BlockEntry,
  node: MockupNode,
): (Written & { name: string }) | undefined {
  const { block } = entry;
  const name = p.names.get(node);
  if (entry.whole || isSketch(node) || !block.editable) return undefined;
  if (block.lockedOptions || changedHeld(p, entry).length > 0) return undefined;
  const write = written(p, entry, node);
  return write.ok && name !== undefined ? { ...write.block, name } : undefined;
}

/** Whether a moved block and every child it took along can be written new. */
export function copyable(
  p: Planner,
  entry: BlockEntry,
  node: MockupNode,
): boolean {
  if (!copyOf(p, entry, node)) return false;
  return (node.children ?? []).every((child) => {
    const claimed = p.matching.byNode.get(child);
    return (
      claimed?.kind !== "block" ||
      claimed.parent !== entry ||
      copyable(p, claimed, child)
    );
  });
}
