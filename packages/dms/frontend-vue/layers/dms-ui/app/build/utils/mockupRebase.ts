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
 * The spec that keeps an edit on top of a file someone else wrote: `outside`,
 * with the block at `held` of `present` put back in the place its id has there.
 * `written` is the spec the editor last wrote or read, so that `present`
 * differs from it by the edit. Undefined when the edit is not all inside the
 * held block, which `present` and `written` tell by agreeing once it is put
 * back, or when the block has no id, or one that is not the block's alone, in
 * any of the three specs.
 */
export function rebasedEdit(
  written: MockupSpecDocument,
  present: MockupSpecDocument,
  outside: MockupSpecDocument,
  held: string,
): MockupSpecDocument | undefined {
  const heldNode = nodeAt(present, held);
  const id = heldNode?.id;
  if (!heldNode || id === undefined) return undefined;
  const before = uniquePointer(written, id);
  const after = uniquePointer(outside, id);
  if (uniquePointer(present, id) !== held || !before || !after) {
    return undefined;
  }
  const writtenNode = nodeAt(written, before);
  const restored = writtenNode && withNodeAt(present, held, writtenNode);
  return restored && sameSpec(restored, written)
    ? withNodeAt(outside, after, heldNode)
    : undefined;
}
