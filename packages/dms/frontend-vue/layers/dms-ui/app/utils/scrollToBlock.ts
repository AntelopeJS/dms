import { blockAnchorElement } from "../build/composables/page/blockAnchors";

const DEFAULT_SCROLL: ScrollIntoViewOptions = { block: "start" };

/**
 * Brings a block of the page into view, by its anchor: the key path it is
 * declared under, its static field's key for a top-level block (`summary`),
 * then each child key down to it (`tabs.statistics`, `grid.row.latency`).
 * Answers `false`, without scrolling, when no such block is on screen: an
 * unknown key, a block in a closed tab, or one the viewer may not see.
 *
 * @param key The block's anchor
 * @param options Passed to `scrollIntoView`; defaults to `{ block: "start" }`
 */
export function scrollToBlock(
  key: string,
  options: ScrollIntoViewOptions = DEFAULT_SCROLL,
): boolean {
  const element = blockAnchorElement(key);
  if (!element) return false;
  element.scrollIntoView(options);
  return true;
}
