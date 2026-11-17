import type {
  BlockDraft,
  BlockNode,
  ConfigObject,
  PageDraft,
  PageStructure,
} from "@antelopejs/interface-dms-builder";
import {
  changedHeld,
  copyable,
  copyOf,
  fateOf,
  isAnchored,
  isMoveRoot,
  type NodeStamp,
  note,
  placed,
  type Placement,
  preservedDraft,
  type Planner,
  type Written,
} from "./apply-fate";
import {
  type BlockEntry,
  blocksAt,
  isSketch,
  matchTree,
  type Place,
} from "./apply-match";
import { namePlaces } from "./apply-names";
import type { WiringNote, WiringReason } from "./apply-notes";
import { liveOptionsOf, metaOf } from "./apply-options";
import type { NodeOracle } from "./compile";
import type { MockupNode, MockupSpecPage } from "./model";

/** The draft a mockup page writes to its live page, what it leaves to build by hand, and the ids it gives nodes that had none. */
export interface ApplyPlan {
  draft: PageDraft;
  wiring: WiringNote[];
  stamps: NodeStamp[];
}

export interface PlanContext {
  /** The page's JSON pointer in `spec.json`, `/pages/<i>`. */
  pointer: string;
  oracle: NodeOracle;
}

/** The builder paths a draft keeps, writes over, adds and removes, the blocks under a kept or removed one left out. */
export type DraftSummary = {
  /** The page's display name, present only when the draft writes it. */
  displayName?: string;
  preserved: string[];
  written: string[];
  added: string[];
  removed: string[];
};

/** A node no live block stands for, as a block written new and its name, or why it cannot be. */
type Fresh =
  | { ok: true; name: string; block: Written }
  | { ok: false; reason: WiringReason };

function newBlockOf(p: Planner, node: MockupNode): Fresh {
  if (isSketch(node)) return { ok: false, reason: "custom-component" };
  const kind = node.type === undefined ? "unknown" : p.oracle.kindOf(node.type);
  if (node.type === undefined || kind === "unknown") {
    return { ok: false, reason: "type" };
  }
  if (kind === "controller") return { ok: false, reason: "table" };
  const options = liveOptionsOf(
    node.options ?? {},
    p.routes,
    undefined,
    undefined,
  );
  if (!options.ok) return options;
  const name = p.names.get(node);
  if (name === undefined) return { ok: false, reason: "name" };
  return {
    ok: true,
    name,
    block: { type: node.type, config: options.config },
  };
}

/** Where a block sits among its siblings; a top-level block has no slot. */
function placementAt(
  place: Place,
  slot: string | undefined,
  meta: ConfigObject | undefined,
): Placement {
  return place === "root" ? {} : placed(slot, meta);
}

/** Whether `node` is written as a block, so that the nodes under it are written or noted. */
function isWritten(p: Planner, node: MockupNode): boolean {
  const parent = p.matching.parents.get(node);
  if (parent !== undefined && !isWritten(p, parent)) return false;
  const entry = p.matching.byNode.get(node);
  if (entry === undefined) return newBlockOf(p, node).ok;
  if (entry.kind === "held") return false;
  if (isAnchored(p, entry)) return fateOf(p, entry, node).kind === "write";
  return !p.stuck.has(entry);
}

/** Whether a live block sits inside one kept as it is, so it cannot leave its place. */
function keptInside(p: Planner, entry: BlockEntry): boolean {
  for (let at: BlockEntry | undefined = entry; at; at = at.parent) {
    if (p.stays.has(at)) return true;
    const claim = p.matching.byEntry.get(at);
    const preserved =
      at !== entry &&
      claim !== undefined &&
      isAnchored(p, at) &&
      fateOf(p, at, claim.node).kind === "preserve";
    if (preserved) return true;
  }
  return false;
}

/** The outermost block around each stuck one that leaves its place, kept there as it is, with the first stuck block inside. */
function staysOf(p: Planner): Map<BlockEntry, BlockEntry> {
  const stays = new Map<BlockEntry, BlockEntry>();
  for (const entry of p.stuck) {
    let top = entry;
    while (top.parent && !isAnchored(p, top.parent)) top = top.parent;
    if (!stays.has(top)) stays.set(top, entry);
  }
  return stays;
}

/**
 * Decides which moved blocks stay where they were. A moved block is written
 * new at its new place only when all of it can be, its new parent is written,
 * and its old place is not kept as it is; a block left behind keeps every
 * block around it that would leave its place. Staying only spreads, so this
 * settles.
 */
function settle(p: Planner): void {
  const moved = [...p.matching.byEntry.values()].flatMap((claim) =>
    claim.entry.kind === "block" && isMoveRoot(p, claim.entry)
      ? [{ entry: claim.entry, node: claim.node }]
      : [],
  );
  p.stuck = new Set(
    moved
      .filter(({ entry, node }) => !copyable(p, entry, node))
      .map(({ entry }) => entry),
  );
  for (;;) {
    p.stays = staysOf(p);
    const more = moved
      .filter(({ entry, node }) => {
        const parent = p.matching.parents.get(node);
        return (
          !p.stuck.has(entry) &&
          ((parent !== undefined && !isWritten(p, parent)) ||
            keptInside(p, entry))
        );
      })
      .map(({ entry }) => entry);
    if (more.length === 0) return;
    p.stuck = new Set([...p.stuck, ...more]);
  }
}

/**
 * `drafts` with each block kept at this place for a stuck block inside put
 * back after the sibling it followed. A kept block the mockup removed is
 * noted at the stuck block's node, since no node of its own stands for it.
 */
function withStays(
  p: Planner,
  drafts: BlockDraft[],
  place: Place,
): BlockDraft[] {
  const siblings = blocksAt(place, p.matching.roots);
  const result = [...drafts];
  siblings.forEach((entry, index) => {
    const inside = p.stays.get(entry);
    if (inside === undefined) return;
    const before = new Set(siblings.slice(0, index).map((s) => s.block.name));
    const after = result.findLastIndex((draft) => before.has(draft.name));
    const { block } = entry;
    const placement = placementAt(place, block.slot, block.meta);
    result.splice(after + 1, 0, preservedDraft(block, placement));
    const stuck = p.matching.byEntry.get(inside);
    if (stuck && !p.matching.byEntry.has(entry)) {
      note(p, stuck.node, stuck.pointer, "parent", block.path);
    }
  });
  return result;
}

function freshDraft(
  p: Planner,
  name: string,
  block: Written,
  at: { node: MockupNode; pointer: string; place: Place },
): BlockDraft {
  const { node, pointer, place } = at;
  const children = emitList(
    p,
    node.children ?? [],
    `${pointer}/children`,
    "fresh",
  );
  const span =
    node.colSpan === undefined ? undefined : { colSpan: node.colSpan };
  return {
    name,
    type: block.type,
    config: block.config,
    ...placementAt(place, node.slot, span),
    ...(children.length > 0 && { children }),
  };
}

function anchoredDraft(
  p: Planner,
  entry: BlockEntry,
  at: { node: MockupNode; pointer: string; place: Place },
): BlockDraft {
  const { node, pointer, place } = at;
  const { block } = entry;
  const fate = fateOf(p, entry, node);
  const placement = placementAt(
    place,
    node.slot,
    metaOf(block.meta, node.colSpan),
  );
  if (fate.kind === "preserve") {
    if (fate.reason) note(p, node, pointer, fate.reason, block.path);
    return preservedDraft(block, placement);
  }
  for (const held of changedHeld(p, entry)) {
    const claim = p.matching.byEntry.get(held);
    note(
      p,
      claim?.node ?? held.node,
      claim?.pointer ?? pointer,
      "held-block",
      held.path,
    );
  }
  const children = emitList(
    p,
    node.children ?? [],
    `${pointer}/children`,
    entry,
  );
  return {
    name: block.name,
    type: fate.type,
    config: fate.config,
    ...placement,
    ...(block.controller !== undefined && { controller: block.controller }),
    ...(children.length > 0 && { children }),
  };
}

function emitNode(
  p: Planner,
  at: { node: MockupNode; pointer: string; place: Place },
): BlockDraft[] {
  const { node, pointer } = at;
  const entry = p.matching.byNode.get(node);
  if (entry?.kind === "held") return [];
  if (entry === undefined) {
    const made = newBlockOf(p, node);
    if (!made.ok) {
      note(p, node, pointer, made.reason);
      return [];
    }
    if (node.id === undefined) {
      p.stamps.push({ path: pointer, id: made.name, type: made.block.type });
    }
    return [freshDraft(p, made.name, made.block, at)];
  }
  if (isAnchored(p, entry)) return [anchoredDraft(p, entry, at)];
  const copy = p.stuck.has(entry) ? undefined : copyOf(p, entry, node);
  if (!copy) {
    note(
      p,
      node,
      pointer,
      "move",
      p.stuck.has(entry) ? entry.block.path : undefined,
    );
    return [];
  }
  return [freshDraft(p, copy.name, copy, at)];
}

/**
 * The drafts of `nodes`, the children of one place, in the mockup's order. A
 * top-level block written takes no slot or span: one its node sets is noted.
 */
function emitList(
  p: Planner,
  nodes: readonly MockupNode[],
  pointer: string,
  place: Place,
): BlockDraft[] {
  const drafts = nodes.flatMap((node, index) => {
    const at = { node, pointer: `${pointer}/${index}`, place };
    const made = emitNode(p, at);
    const placedAt = node.slot !== undefined || node.colSpan !== undefined;
    if (place === "root" && placedAt && made.length > 0) {
      note(p, node, at.pointer, "placement");
    }
    return made;
  });
  return withStays(p, drafts, place);
}

/**
 * The draft that builds `page`, a mockup page converted from a live page,
 * back into it. `reconverted` is the live page converted now, at the version
 * the page records, so a node equal to its counterpart there is unchanged.
 * A block keeps its source byte for byte when its node is unchanged, when it
 * is a sketch standing for it, or when its change needs code or data the
 * mockup does not hold; such a change is listed in `wiring`. Option, order,
 * slot and span edits are written, blocks no node stands for are removed,
 * and new nodes of the builder's own types are added, each under a name the
 * next apply pairs it with again: its id's block name, or, for a node with no
 * id, a name listed in `stamps` for the caller to record as its id. A title
 * the mockup changed is written as the page's display name.
 */
export function planApply(
  page: MockupSpecPage,
  structure: PageStructure,
  reconverted: MockupSpecPage,
  context: PlanContext,
): ApplyPlan {
  const pointer = `${context.pointer}/tree`;
  const p: Planner = {
    matching: matchTree(structure.blocks, reconverted.tree, page.tree, pointer),
    routes: page.liveRoutes ?? {},
    oracle: context.oracle,
    fates: new Map(),
    anchored: new Map(),
    names: new Map(),
    stuck: new Set(),
    stays: new Map(),
    wiring: [],
    stamps: [],
  };
  namePlaces(p, page.tree, "root");
  settle(p);
  const blocks = emitList(p, page.tree, pointer, "root");
  const draft: PageDraft =
    page.title === reconverted.title
      ? { blocks }
      : { page: { displayName: page.title }, blocks };
  return { draft, wiring: p.wiring, stamps: p.stamps };
}

function summarizeList(
  drafts: readonly BlockDraft[],
  live: readonly BlockNode[],
  prefix: string,
  summary: DraftSummary,
): void {
  for (const draft of drafts) {
    const path = `${prefix}${draft.name}`;
    const block = live.find((candidate) => candidate.name === draft.name);
    if (draft.preserve) {
      summary.preserved.push(path);
      continue;
    }
    (block ? summary.written : summary.added).push(path);
    summarizeList(
      draft.children ?? [],
      block?.children ?? [],
      `${path}/`,
      summary,
    );
  }
  for (const block of live) {
    if (!drafts.some((draft) => draft.name === block.name)) {
      summary.removed.push(block.path);
    }
  }
}

/** What writing `draft` over `structure` does to each block, by builder path. */
export function summarize(
  draft: PageDraft,
  structure: PageStructure,
): DraftSummary {
  const summary: DraftSummary = {
    preserved: [],
    written: [],
    added: [],
    removed: [],
  };
  if (draft.page?.displayName !== undefined) {
    summary.displayName = draft.page.displayName;
  }
  summarizeList(
    draft.blocks,
    structure.blocks,
    `${structure.page.ref}#`,
    summary,
  );
  return summary;
}
