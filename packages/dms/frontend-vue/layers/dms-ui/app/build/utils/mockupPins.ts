import type { PreviewBlockRect, PreviewRect } from "./blockPreviewMessages";
import {
  layoutPathFor,
  specPointerFor,
  type MockupAnnotation,
  type MockupPageState,
  type MockupPinOffset,
  type MockupPinPlace,
} from "./mockup";
import {
  CUSTOM_PAGE_SKETCH,
  type MockupSketchStates,
} from "./mockupSketchStates";

/** A point in the preview frame's document, in CSS pixels. */
export interface FramePoint {
  x: number;
  y: number;
}

/** A point of one page of the mockup: the page, and the point of its frame's document. */
export interface PagePoint {
  page: string;
  point: FramePoint;
}

/** What pin geometry reads of a page on screen. */
export interface PinCanvas {
  page: Pick<MockupPageState, "id" | "paths">;
  /** Where each block sits, by layout path, as the preview reports it. */
  blocks: readonly PreviewBlockRect[];
  /** The size of the preview frame's document. */
  width: number;
  height: number;
  /** The state each sketch of the page draws, by spec pointer; a pin on one of them, or on a custom page, remembers it. */
  states?: MockupSketchStates;
}

/**
 * Where a pin shows: at a point of a page on screen, in the tray of
 * comments without a block, or nowhere here (another page, or a block the
 * preview does not draw).
 */
export type PinSpot =
  | { kind: "canvas"; point: FramePoint }
  | { kind: "tray" }
  | { kind: "elsewhere" };

/** Where a drop lands: the place it pins a note at, and the block's box when it is on one. */
export interface PinDrop {
  place: MockupPinPlace;
  block?: PreviewRect;
}

const LAYOUT_SEPARATOR = ".";

function clampFraction(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function pointIn(rect: PreviewRect, offset: MockupPinOffset): FramePoint {
  return {
    x: rect.x + offset.x * rect.width,
    y: rect.y + offset.y * rect.height,
  };
}

function offsetIn(rect: PreviewRect, point: FramePoint): MockupPinOffset {
  return {
    x: clampFraction((point.x - rect.x) / rect.width),
    y: clampFraction((point.y - rect.y) / rect.height),
  };
}

function pageRect(canvas: PinCanvas): PreviewRect {
  return { x: 0, y: 0, width: canvas.width, height: canvas.height };
}

function contains(rect: PreviewRect, point: FramePoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function depthOf(layoutPath: string): number {
  return layoutPath.split(LAYOUT_SEPARATOR).length;
}

/** Where `note` shows on `canvas`. */
export function pinSpot(
  note: Pick<MockupAnnotation, "page" | "path" | "offset">,
  canvas: PinCanvas,
): PinSpot {
  if (note.page === undefined) return { kind: "tray" };
  if (note.page !== canvas.page.id) return { kind: "elsewhere" };
  if (note.path === undefined) {
    return { kind: "canvas", point: pointIn(pageRect(canvas), note.offset) };
  }
  const layoutPath = layoutPathFor(canvas.page, note.path);
  const block = canvas.blocks.find((entry) => entry.path === layoutPath);
  return block
    ? { kind: "canvas", point: pointIn(block.rect, note.offset) }
    : { kind: "elsewhere" };
}

/**
 * What a pin dropped at `point` is on: the innermost block of the spec under
 * it, at the point's offset in that block's box, else the page itself.
 */
export function pinDropAt(point: FramePoint, canvas: PinCanvas): PinDrop {
  const under = canvas.blocks
    .flatMap(({ path, rect }) => {
      const pointer = specPointerFor(canvas.page, path);
      return pointer !== undefined && contains(rect, point)
        ? [{ pointer, rect, depth: depthOf(path) }]
        : [];
    })
    .sort(
      (left, right) =>
        right.depth - left.depth ||
        left.rect.width * left.rect.height -
          right.rect.width * right.rect.height,
    )[0];
  if (!under) {
    const state = canvas.states?.get(CUSTOM_PAGE_SKETCH);
    return {
      place: {
        page: canvas.page.id,
        offset: offsetIn(pageRect(canvas), point),
        ...(state !== undefined && { state }),
      },
    };
  }
  const state = canvas.states?.get(under.pointer);
  return {
    place: {
      page: canvas.page.id,
      path: under.pointer,
      offset: offsetIn(under.rect, point),
      ...(state !== undefined && { state }),
    },
    block: under.rect,
  };
}

/** Whether `point` is on the page drawn on `canvas`. */
export function isOnCanvas(point: FramePoint, canvas: PinCanvas): boolean {
  return contains(pageRect(canvas), point);
}
