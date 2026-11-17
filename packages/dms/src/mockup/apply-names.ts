import { isAnchored, type Planner } from "./apply-fate";
import { blockNameOf, blocksAt, type Place } from "./apply-match";
import type { MockupNode } from "./model";

const UNTYPED_NAME = "block";

/** Whether `node`, when written, is written as a new block: no live block keeps its place for it. */
function writtenNew(p: Planner, node: MockupNode): boolean {
  const entry = p.matching.byNode.get(node);
  if (entry === undefined) return true;
  return entry.kind === "block" && !isAnchored(p, entry);
}

/** The place the children of `node` are written at: under its live block when that keeps its place, else under a block written new. */
function childPlace(p: Planner, node: MockupNode): Place {
  const entry = p.matching.byNode.get(node);
  return entry?.kind === "block" && isAnchored(p, entry) ? entry : "fresh";
}

function typedName(type: string | undefined): string {
  if (type === undefined) return UNTYPED_NAME;
  return blockNameOf(`${type.charAt(0).toLowerCase()}${type.slice(1)}`);
}

function unusedName(base: string, taken: Set<string>): string {
  let name = base;
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${base}${suffix}`;
  taken.add(name);
  return name;
}

/**
 * Names, in `p.names`, each node of `nodes`, the children of `place`, that
 * is written new there, then the nodes under them. A node with an id takes
 * its id's block name, which the next apply matches it by, unless a live
 * block at the place or a node before it has that name: it then takes none
 * and is not written, since any other name would be lost on the next apply.
 * A node with no id takes a name made from its type that no block, id or
 * name at the place has, and the apply records it as the node's id.
 */
export function namePlaces(
  p: Planner,
  nodes: readonly MockupNode[],
  place: Place,
): void {
  const owned = new Set(
    blocksAt(place, p.matching.roots).map(({ block }) => block.name),
  );
  const taken = new Set([
    ...owned,
    ...nodes.flatMap(({ id }) =>
      id === undefined ? [] : [id, blockNameOf(id)],
    ),
  ]);
  for (const node of nodes) {
    if (!writtenNew(p, node)) continue;
    if (node.id === undefined) {
      p.names.set(node, unusedName(typedName(node.type), taken));
      continue;
    }
    const name = blockNameOf(node.id);
    if (owned.has(name)) continue;
    owned.add(name);
    p.names.set(node, name);
  }
  for (const node of nodes) {
    namePlaces(p, node.children ?? [], childPlace(p, node));
  }
}
