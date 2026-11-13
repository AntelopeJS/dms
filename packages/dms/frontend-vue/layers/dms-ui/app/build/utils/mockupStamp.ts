import type { MockupHistory } from "./mockupHistory";
import {
  nodeAt,
  type MockupSpecDocument,
  type MockupSpecNode,
} from "./mockupSpec";

/** An id a note stamped on a node that had none: where the node is, the id, and the node before it. */
interface Stamp {
  pointer: string;
  id: string;
  node: MockupSpecNode;
}

type NodeUpdate = (node: MockupSpecNode, pointer: string) => MockupSpecNode;

function mapNodes(
  spec: MockupSpecDocument,
  update: NodeUpdate,
): MockupSpecDocument {
  const map = (nodes: MockupSpecNode[], pointer: string): MockupSpecNode[] =>
    nodes.map((node, index) => {
      const at = `${pointer}/${index}`;
      const updated = update(node, at);
      return updated.children
        ? { ...updated, children: map(updated.children, `${at}/children`) }
        : updated;
    });
  return {
    ...spec,
    pages: spec.pages.map((page, index) => ({
      ...page,
      tree: map(page.tree, `/pages/${index}/tree`),
    })),
  };
}

interface PlacedNode {
  pointer: string;
  node: MockupSpecNode;
}

function nodesOf(spec: MockupSpecDocument): PlacedNode[] {
  const walk = (nodes: MockupSpecNode[], pointer: string): PlacedNode[] =>
    nodes.flatMap((node, index) => {
      const at = `${pointer}/${index}`;
      return [
        { pointer: at, node },
        ...walk(node.children ?? [], `${at}/children`),
      ];
    });
  return spec.pages.flatMap((page, index) =>
    walk(page.tree, `/pages/${index}/tree`),
  );
}

/** The ids `file` adds to nodes of `base` that had none, when that is all it changes. */
function stampsOn(
  base: MockupSpecDocument,
  file: MockupSpecDocument,
): Stamp[] | undefined {
  const stamps: Stamp[] = [];
  const unstamped = mapNodes(file, (node, pointer) => {
    const before = nodeAt(base, pointer);
    const { id, ...rest } = node;
    if (!before || before.id !== undefined || id === undefined) return node;
    stamps.push({ pointer, id, node: before });
    return rest;
  });
  return stamps.length > 0 && JSON.stringify(unstamped) === JSON.stringify(base)
    ? stamps
    : undefined;
}

/** `spec` with the id `ids` holds for each pointer set on the node there, when it has none. */
function withIds(
  spec: MockupSpecDocument,
  ids: ReadonlyMap<string, string>,
): MockupSpecDocument {
  if (!ids.size) return spec;
  return mapNodes(spec, (node, pointer) => {
    const id = node.id === undefined ? ids.get(pointer) : undefined;
    return id === undefined ? node : { ...node, id };
  });
}

/** Each stamp's id, keyed by the pointer of the one node of `spec` without an id that equals the stamp's node, when there is exactly one. */
function matchedIds(
  spec: MockupSpecDocument,
  stamps: readonly Stamp[],
): Map<string, string> {
  const candidates = nodesOf(spec).filter(({ node }) => node.id === undefined);
  const ids = new Map<string, string>();
  for (const { id, node } of stamps) {
    const text = JSON.stringify(node);
    const matches = candidates.filter(
      (candidate) => JSON.stringify(candidate.node) === text,
    );
    const [only] = matches;
    if (only && matches.length === 1) ids.set(only.pointer, id);
  }
  return ids;
}

/**
 * The history with the ids `file` adds to `written`, the spec the editor
 * last wrote or read, when `file` differs from it only by ids a note stamped
 * on nodes that had none; undefined otherwise. `file` takes the place of
 * `written` in the history, the present takes each id at its node's pointer,
 * and every other step takes an id where exactly one node without an id
 * equals the stamped node without it.
 */
export function stampedHistory(
  history: MockupHistory<MockupSpecDocument>,
  written: MockupSpecDocument,
  file: MockupSpecDocument,
): MockupHistory<MockupSpecDocument> | undefined {
  const stamps = stampsOn(written, file);
  if (!stamps) return undefined;
  const step = (spec: MockupSpecDocument) =>
    spec === written ? file : withIds(spec, matchedIds(spec, stamps));
  const atPointers = new Map(stamps.map(({ pointer, id }) => [pointer, id]));
  return {
    ...history,
    past: history.past.map(step),
    present:
      history.present === written ? file : withIds(history.present, atPointers),
    future: history.future.map(step),
  };
}
