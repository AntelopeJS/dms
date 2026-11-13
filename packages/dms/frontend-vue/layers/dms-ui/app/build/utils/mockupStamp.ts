import type { MockupHistory } from "./mockupHistory";
import {
  nodeAt,
  type MockupSpecDocument,
  type MockupSpecNode,
  type MockupSpecPage,
} from "./mockupSpec";

interface Placed {
  pointer: string;
  node: MockupSpecNode;
}

/** An id a note stamped on a node of the base spec that had none: that node, and the id. */
interface Stamp extends Placed {
  id: string;
}

type Pointers = ReadonlyMap<MockupSpecNode, string>;

/** What taking a stamp leaves: the history with the ids, and the base it was stamped on with them. */
export interface StampedHistory {
  history: MockupHistory<MockupSpecDocument>;
  written: MockupSpecDocument;
}

function pointersOf(spec: MockupSpecDocument): Pointers {
  const pointers = new Map<MockupSpecNode, string>();
  const walk = (nodes: MockupSpecNode[], pointer: string): void => {
    nodes.forEach((node, index) => {
      const at = `${pointer}/${index}`;
      pointers.set(node, at);
      walk(node.children ?? [], `${at}/children`);
    });
  };
  spec.pages.forEach((page, index) => walk(page.tree, `/pages/${index}/tree`));
  return pointers;
}

/** The ids `file` adds to nodes of `base` that had none, when that is all it changes. */
function stampsOn(
  base: MockupSpecDocument,
  file: MockupSpecDocument,
): Stamp[] | undefined {
  const stamps: Stamp[] = [];
  const bare = (nodes: MockupSpecNode[], pointer: string): MockupSpecNode[] =>
    nodes.map((node, index) => {
      const at = `${pointer}/${index}`;
      const before = nodeAt(base, at);
      const { id, ...rest } = node;
      let kept = node;
      if (before && before.id === undefined && id !== undefined) {
        stamps.push({ pointer: at, node: before, id });
        kept = rest;
      }
      return kept.children
        ? { ...kept, children: bare(kept.children, `${at}/children`) }
        : kept;
    });
  const unstamped = {
    ...file,
    pages: file.pages.map((page, index) => ({
      ...page,
      tree: bare(page.tree, `/pages/${index}/tree`),
    })),
  };
  return stamps.length > 0 && JSON.stringify(unstamped) === JSON.stringify(base)
    ? stamps
    : undefined;
}

function isSameKind(left: MockupSpecNode, right: MockupSpecNode): boolean {
  return left.type === right.type && left.componentName === right.componentName;
}

function partsOf(node: MockupSpecNode): unknown[] {
  return [
    ...Object.values(node).filter((value) => value instanceof Object),
    ...(node.children ?? []),
  ];
}

/** Whether `node` holds an object of `origin` itself, such as its options or one of its children. */
function holdsPartOf(node: MockupSpecNode, origin: MockupSpecNode): boolean {
  const parts = new Set(partsOf(node));
  return partsOf(origin).some((part) => parts.has(part));
}

/**
 * The node of a neighbouring step that is the block `origin` of the step
 * `from`: the same object, which every edit keeps for a node it neither
 * changes nor copies. Else the one node `to` has and `from` has not, of the
 * same type and component, that sits at `origin`'s pointer or holds part of
 * `origin`: the copy the edit between the steps made of it. Undefined when
 * no node of `to` is that block, or several could be.
 */
function counterpart(
  origin: Placed,
  from: Pointers,
  to: Pointers,
): Placed | undefined {
  const kept = to.get(origin.node);
  if (kept !== undefined) return { pointer: kept, node: origin.node };
  const copies = [...to].flatMap(([node, pointer]) =>
    !from.has(node) &&
    isSameKind(node, origin.node) &&
    (pointer === origin.pointer || holdsPartOf(node, origin.node))
      ? [{ pointer, node }]
      : [],
  );
  return copies.length === 1 ? copies[0] : undefined;
}

/** The node that is the block `first` of step `start` in each step outward, both ways, up to the first step without it. */
function followed(
  steps: readonly Pointers[],
  start: number,
  first: Placed,
): MockupSpecNode[] {
  const nodes = [first.node];
  for (const direction of [-1, 1]) {
    let placed: Placed | undefined = first;
    for (
      let index = start + direction;
      placed && index >= 0 && index < steps.length;
      index += direction
    ) {
      placed = counterpart(placed, steps[index - direction], steps[index]);
      if (placed) nodes.push(placed.node);
    }
  }
  return nodes;
}

function memoized<Value extends object>(
  rewrite: (value: Value) => Value,
): (value: Value) => Value {
  const done = new Map<Value, Value>();
  return (value) => {
    const known = done.get(value);
    if (known) return known;
    const next = rewrite(value);
    done.set(value, next);
    return next;
  };
}

function sameList<Item>(next: Item[], previous: Item[]): Item[] {
  return next.every((item, index) => item === previous[index])
    ? previous
    : next;
}

/**
 * Rewrites specs with the id `ids` holds for each node object that has
 * none. A node, page or spec that changes nothing stays the same object,
 * and an object several specs share is rewritten once, so they keep
 * sharing it.
 */
function withIds(
  ids: ReadonlyMap<MockupSpecNode, string>,
): (spec: MockupSpecDocument) => MockupSpecDocument {
  const node = memoized((current: MockupSpecNode): MockupSpecNode => {
    const children =
      current.children &&
      sameList(current.children.map(node), current.children);
    const id = current.id === undefined ? ids.get(current) : undefined;
    if (id === undefined && children === current.children) return current;
    const next: MockupSpecNode = { ...current };
    if (children !== current.children) next.children = children;
    if (id !== undefined) next.id = id;
    return next;
  });
  const page = memoized((current: MockupSpecPage): MockupSpecPage => {
    const tree = sameList(current.tree.map(node), current.tree);
    return tree === current.tree ? current : { ...current, tree };
  });
  return memoized((spec: MockupSpecDocument): MockupSpecDocument => {
    const pages = sameList(spec.pages.map(page), spec.pages);
    return pages === spec.pages ? spec : { ...spec, pages };
  });
}

function placeStamps(
  history: MockupHistory<MockupSpecDocument>,
  base: MockupSpecDocument,
  stamps: readonly Stamp[],
): StampedHistory {
  const specs = [...history.past, history.present, ...history.future];
  const steps = specs.map(pointersOf);
  const at = specs.indexOf(base);
  const start = at < 0 ? history.past.length : at;
  const basePointers = at < 0 ? pointersOf(base) : steps[at];
  const ids = new Map<MockupSpecNode, string>();
  for (const stamp of stamps) {
    ids.set(stamp.node, stamp.id);
    const first =
      at < 0 ? counterpart(stamp, basePointers, steps[start]) : stamp;
    for (const node of first ? followed(steps, start, first) : []) {
      if (!ids.has(node)) ids.set(node, stamp.id);
    }
  }
  const rewrite = withIds(ids);
  return {
    history: {
      ...history,
      past: history.past.map(rewrite),
      present: rewrite(history.present),
      future: history.future.map(rewrite),
    },
    written: rewrite(base),
  };
}

/**
 * The history with the ids `file` adds to one of `bases`, the specs the
 * editor last wrote or read and those it sent without an answer, when
 * `file` differs from that base only by ids a note stamped on nodes that
 * had none; undefined otherwise. Each id goes on its node in the base, then
 * on the node that is the same block in each step of the history, step by
 * step outward from the base both ways, up to a step where the block is
 * not: see {@link counterpart}. A base the history no longer holds, which
 * typing in one field replaced, counts as the step before the present.
 */
export function stampedHistory(
  history: MockupHistory<MockupSpecDocument>,
  bases: readonly MockupSpecDocument[],
  file: MockupSpecDocument,
): StampedHistory | undefined {
  for (const base of bases) {
    const stamps = stampsOn(base, file);
    if (stamps) return placeStamps(history, base, stamps);
  }
  return undefined;
}
