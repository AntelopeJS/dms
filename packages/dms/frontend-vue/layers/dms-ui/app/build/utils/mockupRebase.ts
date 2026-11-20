import {
  nodeAt,
  parseNodePointer,
  pointerOfId,
  type MockupSpecDocument,
  type MockupSpecNode,
} from "./mockupSpec";

function sameSpec(
  left: MockupSpecDocument,
  right: MockupSpecDocument,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** `spec` with the node at `pointer` replaced by `node`; every other object stays the same one. */
function withNodeAt(
  spec: MockupSpecDocument,
  pointer: string,
  node: MockupSpecNode,
): MockupSpecDocument | undefined {
  const address = parseNodePointer(pointer);
  if (!address) return undefined;
  const replace = (
    list: MockupSpecNode[],
    steps: readonly number[],
  ): MockupSpecNode[] => {
    const [step, ...rest] = steps;
    return list.map((entry, index) => {
      if (index !== step) return entry;
      return rest.length === 0
        ? node
        : { ...entry, children: replace(entry.children ?? [], rest) };
    });
  };
  return {
    ...spec,
    pages: spec.pages.map((page, index) =>
      index === address.page
        ? { ...page, tree: replace(page.tree, address.steps) }
        : page,
    ),
  };
}

/**
 * For each child of an edited list, the index of the node of `base` it is: the
 * very object, which an edit keeps for a child it does not change, else the
 * child at its own place when the edit changed no list length and the types
 * still agree. A node of `base` that a child is the very object of is no other
 * child's origin, so that no two children are one node.
 */
function originIndexes(
  edited: readonly MockupSpecNode[],
  base: readonly MockupSpecNode[],
): Array<number | undefined> {
  const same = edited.map((child) => base.indexOf(child));
  const claimed = new Set(same);
  return edited.map((child, index) => {
    if (same[index] !== -1) return same[index];
    return edited.length === base.length &&
      !claimed.has(index) &&
      base[index]?.type === child.type
      ? index
      : undefined;
  });
}

/**
 * `held`, an edit of the node `base`, with the ids `outside`, the file's copy
 * of `base`, gave to nodes that had none, as a note pinned on one does. A node
 * of `held` that cannot be told to be one of them keeps none, so that an id
 * goes on no block rather than on the wrong one.
 */
function withStampsOf(
  held: MockupSpecNode,
  base: MockupSpecNode,
  outside: MockupSpecNode,
): MockupSpecNode {
  const id =
    held.id === undefined && base.id === undefined ? outside.id : undefined;
  const origins = originIndexes(held.children ?? [], base.children ?? []);
  const children = held.children?.map((child, index) => {
    const origin = origins[index];
    const before = origin === undefined ? undefined : base.children?.[origin];
    const after = origin === undefined ? undefined : outside.children?.[origin];
    return before && after && before.type === after.type
      ? withStampsOf(child, before, after)
      : child;
  });
  const isChanged =
    id !== undefined ||
    children?.some((child, index) => child !== held.children?.[index]);
  if (!isChanged) return held;
  const stamped: MockupSpecNode = { ...held };
  if (id !== undefined) stamped.id = id;
  if (children !== undefined) stamped.children = children;
  return stamped;
}

/**
 * The spec that keeps an edit on top of a file someone else wrote: `outside`,
 * with the block `held` names, as `present` has it, put back in the place that
 * id has there. `held` is the block's id, which finds it wherever each spec
 * has it, and `written` is the spec the editor last wrote or read, so that
 * `present` differs from it by the edit. Undefined when the edit is not all
 * inside the held block, which `present` and `written` tell by agreeing once
 * it is put back, or when `held` is not the id of one block alone in each of
 * the three specs.
 */
export function rebasedEdit(
  written: MockupSpecDocument,
  present: MockupSpecDocument,
  outside: MockupSpecDocument,
  held: string,
): MockupSpecDocument | undefined {
  const heldAt = pointerOfId(present, held);
  const before = pointerOfId(written, held);
  const after = pointerOfId(outside, held);
  if (!heldAt || !before || !after) return undefined;
  const heldNode = nodeAt(present, heldAt);
  const writtenNode = nodeAt(written, before);
  const outsideNode = nodeAt(outside, after);
  const restored = writtenNode && withNodeAt(present, heldAt, writtenNode);
  if (
    !heldNode ||
    !writtenNode ||
    !outsideNode ||
    !restored ||
    !sameSpec(restored, written)
  ) {
    return undefined;
  }
  return withNodeAt(
    outside,
    after,
    withStampsOf(heldNode, writtenNode, outsideNode),
  );
}
