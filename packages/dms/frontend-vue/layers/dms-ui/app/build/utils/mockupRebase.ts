import {
  nodeAt,
  parseNodePointer,
  pointersOfId,
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

/** The one pointer `id` has in `spec`; undefined when no node or several carry it. */
function uniquePointer(
  spec: MockupSpecDocument,
  id: string,
): string | undefined {
  const [only, ...others] = pointersOfId(spec, id);
  return others.length === 0 ? only : undefined;
}

/**
 * The node of `base` the `child` of an edited list is: the very object, which
 * an edit keeps for a child it does not change, else the child at its own
 * place when the edit changed no list length and the types still agree.
 */
function originIndex(
  edited: readonly MockupSpecNode[],
  child: MockupSpecNode,
  index: number,
  base: readonly MockupSpecNode[],
): number | undefined {
  const same = base.indexOf(child);
  if (same !== -1) return same;
  return edited.length === base.length && base[index]?.type === child.type
    ? index
    : undefined;
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
  const children = held.children?.map((child, index) => {
    const origin = originIndex(
      held.children ?? [],
      child,
      index,
      base.children ?? [],
    );
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

/** An edit kept on top of a file someone else wrote: the spec, and where the held block is in it. */
export interface RebasedEdit {
  spec: MockupSpecDocument;
  held: string;
}

/**
 * The spec that keeps an edit on top of a file someone else wrote: `outside`,
 * with the block at `held` of `present` put back in the place its id has there,
 * which is the block's pointer in the spec then. `written` is the spec the
 * editor last wrote or read, so that `present` differs from it by the edit.
 * Undefined when the edit is not all inside the held block, which `present`
 * and `written` tell by agreeing once it is put back, or when the block has
 * no id, or one that is not the block's alone, in any of the three specs.
 */
export function rebasedEdit(
  written: MockupSpecDocument,
  present: MockupSpecDocument,
  outside: MockupSpecDocument,
  held: string,
): RebasedEdit | undefined {
  const heldNode = nodeAt(present, held);
  const id = heldNode?.id;
  if (!heldNode || id === undefined) return undefined;
  const before = uniquePointer(written, id);
  const after = uniquePointer(outside, id);
  if (uniquePointer(present, id) !== held || !before || !after) {
    return undefined;
  }
  const writtenNode = nodeAt(written, before);
  const outsideNode = nodeAt(outside, after);
  const restored = writtenNode && withNodeAt(present, held, writtenNode);
  if (
    !writtenNode ||
    !outsideNode ||
    !restored ||
    !sameSpec(restored, written)
  ) {
    return undefined;
  }
  const spec = withNodeAt(
    outside,
    after,
    withStampsOf(heldNode, writtenNode, outsideNode),
  );
  return spec && { spec, held: after };
}
