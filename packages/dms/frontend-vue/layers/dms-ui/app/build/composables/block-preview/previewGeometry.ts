import { blockAnchorElements, blockAnchorPaths } from "../page/blockAnchors";
import type {
  PreviewBlockRect,
  PreviewFont,
  PreviewRect,
} from "../../utils/blockPreviewMessages";

/** `element`'s box in the document, scroll included. */
export function documentRect(element: Element): PreviewRect {
  const box = element.getBoundingClientRect();
  return {
    x: box.left + window.scrollX,
    y: box.top + window.scrollY,
    width: box.width,
    height: box.height,
  };
}

/** The box around every element of `elements` that takes room; undefined when none does. */
function unionRect(elements: readonly Element[]): PreviewRect | undefined {
  const boxes = elements
    .map(documentRect)
    .filter((box) => box.width > 0 || box.height > 0);
  if (!boxes.length) return undefined;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Where each block on screen sits, by layout path; hidden blocks left out. */
export function blockRects(): PreviewBlockRect[] {
  return blockAnchorPaths().flatMap((path) => {
    const rect = unionRect(blockAnchorElements(path));
    return rect ? [{ path, rect }] : [];
  });
}

/** How `element` draws its text. */
export function fontOf(element: Element): PreviewFont {
  const style = window.getComputedStyle(element);
  return {
    family: style.fontFamily,
    size: style.fontSize,
    weight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    color: style.color,
    align: style.textAlign,
  };
}
