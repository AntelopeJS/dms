const SCROLLABLE_OVERFLOW = /(auto|scroll)/;

/** Where an element lands in its scroll container. */
export type ScrollWithinBlock = "start" | "center" | "nearest";

/** How `scrollWithin` brings an element into view. */
export interface ScrollWithinOptions {
  block?: ScrollWithinBlock;
  behavior?: ScrollBehavior;
}

/**
 * The closest ancestor of `element` the user can scroll (`overflow-y: auto`
 * or `scroll`, with content taller than itself), or `null` when only the
 * window scrolls it.
 *
 * @internal
 */
export function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      SCROLLABLE_OVERFLOW.test(overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return null;
}

interface ScrollViewport {
  top: number;
  height: number;
  scrollTop: number;
}

function viewportOf(scroller: HTMLElement | null): ScrollViewport {
  if (scroller) {
    return {
      top: scroller.getBoundingClientRect().top,
      height: scroller.clientHeight,
      scrollTop: scroller.scrollTop,
    };
  }
  return { top: 0, height: window.innerHeight, scrollTop: window.scrollY };
}

function scrollMarginTop(element: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
}

/** The scroll offset that puts `rect` at `block` in `viewport`. */
function targetOffset(
  rect: DOMRect,
  margin: number,
  viewport: ScrollViewport,
  block: ScrollWithinBlock,
): number | null {
  const top = rect.top - viewport.top - margin;
  if (block === "start") return viewport.scrollTop + top;
  if (block === "center") {
    return viewport.scrollTop + top - (viewport.height - rect.height) / 2;
  }
  const bottom = rect.bottom - viewport.top;
  if (top >= 0 && bottom <= viewport.height) return null;
  return top < 0
    ? viewport.scrollTop + top
    : viewport.scrollTop + bottom - viewport.height;
}

/**
 * Brings `element` into view by scrolling its own scroll container only
 * (the window when nothing closer scrolls it), honouring its
 * `scroll-margin-top`. Unlike `scrollIntoView`, no other ancestor moves.
 *
 * @internal
 */
export function scrollWithin(
  element: HTMLElement,
  { block = "start", behavior = "auto" }: ScrollWithinOptions = {},
): void {
  const scroller = scrollParent(element);
  const offset = targetOffset(
    element.getBoundingClientRect(),
    block === "start" ? scrollMarginTop(element) : 0,
    viewportOf(scroller),
    block,
  );
  if (offset === null) return;
  const top = Math.max(0, offset);
  if (scroller) scroller.scrollTo({ top, behavior });
  else window.scrollTo({ top, behavior });
}
