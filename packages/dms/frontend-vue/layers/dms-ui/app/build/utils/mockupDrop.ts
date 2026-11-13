import type { PreviewBlockRect, PreviewRect } from "./blockPreviewMessages";
import {
  acceptsChild,
  type MockupBlockType,
  type MockupNewBlock,
} from "./mockupCatalog";
import type { MockupEdit } from "./mockupEdit";
import {
  isWithinPointer,
  nodeAt,
  parentPointer,
  parseNodePointer,
  type MockupSpecDocument,
} from "./mockupSpec";

/** What is being dragged over the page: a new block of a type, or a node of the page. */
export type MockupDrag =
  | { kind: "add"; type: string }
  | { kind: "move"; pointer: string; type: string };

/** Where a drop lands: under `parent` (null for the page root), before its child `index`. */
export interface MockupDropTarget {
  parent: string | null;
  /** The position among the list as it is now, the dragged node included. */
  index: number;
  /** Where to draw the drop line, in the preview's coordinates. */
  line: PreviewRect;
}

/** What the drop geometry reads of the page under the pointer. */
export interface MockupDropContext {
  spec: MockupSpecDocument;
  page: number;
  /** Where each block sits, by layout path, as the preview reports it. */
  blocks: readonly PreviewBlockRect[];
  /** The spec pointer of each layout path, as the compiled state maps them. */
  paths: Readonly<Record<string, string>>;
  catalog: ReadonlyMap<string, MockupBlockType>;
}

interface Point {
  x: number;
  y: number;
}

interface Box {
  pointer: string;
  index: number;
  parent: string | null;
  rect: PreviewRect;
}

const LINE_THICKNESS = 3;
const LINE_INSET = 8;

function contains(rect: PreviewRect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function overlapsVertically(left: PreviewRect, right: PreviewRect): boolean {
  return left.y < right.y + right.height && right.y < left.y + left.height;
}

function boxesOf(context: MockupDropContext, drag: MockupDrag): Box[] {
  return context.blocks.flatMap(({ path, rect }) => {
    const pointer = Object.hasOwn(context.paths, path)
      ? context.paths[path]
      : undefined;
    const address = pointer ? parseNodePointer(pointer) : undefined;
    const parent = pointer ? parentPointer(pointer) : undefined;
    const index = address?.steps.at(-1);
    const isOnPage = address?.page === context.page;
    if (!pointer || !isOnPage || index === undefined || parent === undefined) {
      return [];
    }
    if (drag.kind === "move" && isWithinPointer(pointer, drag.pointer)) {
      return [];
    }
    return [{ pointer, index, parent, rect }];
  });
}

function typeAt(context: MockupDropContext, pointer: string | null) {
  if (pointer === null) return undefined;
  const type = nodeAt(context.spec, pointer)?.type;
  return type === undefined ? undefined : context.catalog.get(type);
}

function takes(
  context: MockupDropContext,
  parent: string | null,
  type: string,
): boolean {
  return parent === null || acceptsChild(typeAt(context, parent), type);
}

/** Whether `box` reads before `point`: above it in a stack, or above or left of it in a row. */
function isBefore(box: Box, point: Point, isRow: boolean): boolean {
  const { rect } = box;
  const isBeside = rect.y <= point.y && point.y <= rect.y + rect.height;
  if (!isRow) {
    const isRightOf = isBeside && rect.x + rect.width < point.x;
    return rect.y + rect.height / 2 < point.y || isRightOf;
  }
  if (rect.y + rect.height <= point.y) return true;
  return isBeside && rect.x + rect.width / 2 < point.x;
}

function lineBefore(box: Box, isRow: boolean): PreviewRect {
  const { rect } = box;
  return isRow
    ? {
        x: rect.x - LINE_THICKNESS,
        y: rect.y,
        width: LINE_THICKNESS,
        height: rect.height,
      }
    : {
        x: rect.x,
        y: rect.y - LINE_THICKNESS,
        width: rect.width,
        height: LINE_THICKNESS,
      };
}

function lineAfter(box: Box, isRow: boolean): PreviewRect {
  const { rect } = box;
  return isRow
    ? {
        x: rect.x + rect.width,
        y: rect.y,
        width: LINE_THICKNESS,
        height: rect.height,
      }
    : {
        x: rect.x,
        y: rect.y + rect.height,
        width: rect.width,
        height: LINE_THICKNESS,
      };
}

function insideLine(rect: PreviewRect | undefined): PreviewRect {
  if (!rect) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: rect.x + LINE_INSET,
    y: rect.y + LINE_INSET,
    width: Math.max(0, rect.width - LINE_INSET * 2),
    height: LINE_THICKNESS,
  };
}

/** Where a drop at `point` lands among the children of `parent`. */
function placeAmong(
  boxes: readonly Box[],
  parent: string | null,
  parentRect: PreviewRect | undefined,
  point: Point,
): MockupDropTarget {
  const children = boxes
    .filter((box) => box.parent === parent)
    .sort((left, right) => left.index - right.index);
  const isRow = children.some((box, position) => {
    const previous = children[position - 1];
    return (
      previous !== undefined && overlapsVertically(box.rect, previous.rect)
    );
  });
  const before = children.filter((box) => isBefore(box, point, isRow));
  const last = before.at(-1);
  const next = children.find((box) => !before.includes(box));
  const index = last ? last.index + 1 : (next?.index ?? 0);
  if (next) return { parent, index, line: lineBefore(next, isRow) };
  if (last) return { parent, index, line: lineAfter(last, isRow) };
  return { parent, index, line: insideLine(parentRect) };
}

/**
 * Where a drag over the preview lands at `point`: inside the innermost block
 * under it that takes the dragged type as a child, else beside the innermost
 * one whose parent takes it, else on the page itself. A moved node never
 * lands inside itself.
 */
export function dropTarget(
  context: MockupDropContext,
  drag: MockupDrag,
  point: Point,
): MockupDropTarget {
  const boxes = boxesOf(context, drag);
  const under = boxes
    .filter((box) => contains(box.rect, point))
    .sort((left, right) => right.pointer.length - left.pointer.length);
  for (const box of under) {
    if (takes(context, box.pointer, drag.type)) {
      return placeAmong(boxes, box.pointer, box.rect, point);
    }
    if (takes(context, box.parent, drag.type)) {
      const parentRect = boxes.find((entry) => entry.pointer === box.parent);
      return placeAmong(boxes, box.parent, parentRect?.rect, point);
    }
  }
  return placeAmong(boxes, null, undefined, point);
}

/** The edit a drop makes: a new node, or the dragged one moved there. */
export function dropEdit(
  drag: MockupDrag,
  target: MockupDropTarget,
  page: string,
  newBlock: () => MockupNewBlock,
): MockupEdit {
  if (drag.kind === "add") {
    return {
      kind: "insertNode",
      parent: target.parent,
      page,
      index: target.index,
      ...newBlock(),
    };
  }
  const from = parseNodePointer(drag.pointer)?.steps.at(-1) ?? 0;
  const isSameList = parentPointer(drag.pointer) === target.parent;
  return {
    kind: "moveNode",
    from: drag.pointer,
    parent: target.parent,
    index: isSameList && from < target.index ? target.index - 1 : target.index,
  };
}

/**
 * Where a block added from the keyboard goes: right after the selected node,
 * or after the nearest ancestor whose parent takes its type, or at the end of
 * the page when nothing is selected.
 */
export function insertionAfter(
  spec: MockupSpecDocument,
  page: number,
  selection: string | undefined,
  type: string,
  catalog: ReadonlyMap<string, MockupBlockType>,
): { parent: string | null; index: number } {
  const context = { spec, page, blocks: [], paths: {}, catalog };
  let current = selection;
  while (current !== undefined) {
    const address = parseNodePointer(current);
    const parent = parentPointer(current);
    if (!address || parent === undefined || address.page !== page) break;
    if (takes(context, parent, type)) {
      return { parent, index: (address.steps.at(-1) ?? 0) + 1 };
    }
    current = parent ?? undefined;
  }
  return { parent: null, index: spec.pages[page]?.tree.length ?? 0 };
}
