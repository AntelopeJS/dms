// The DOM side of the drag engine: which registered surface the pointer is
// over, and how fast the area under it scrolls near its edges.

import type {
  AgendaDropSurface,
  AgendaDropTarget,
  AgendaSurfaceViewport,
} from "./agendaModel";

/** A surface the pointer is over, and what it says is there. */
export interface AgendaSurfaceHit {
  surface: AgendaDropSurface;
  target: AgendaDropTarget;
}

/** Pixels from a scroller's edge where dragging starts scrolling it. */
export const AUTO_SCROLL_EDGE = 40;
/** Pixels per frame at the very edge (and past it). */
export const AUTO_SCROLL_MAX_SPEED = 20;

const SCROLLING = /(auto|scroll|overlay)/;

function depth(element: Element): number {
  let count = 0;
  for (let node = element.parentElement; node; node = node.parentElement)
    count += 1;
  return count;
}

function contains(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * The surface under a point and its target. The element under the point
 * decides when the browser can tell (an overlay sheet hides the grid under
 * it); the innermost surface wins over one holding it.
 */
export function hitSurface(
  surfaces: readonly AgendaDropSurface[],
  x: number,
  y: number,
): AgendaSurfaceHit | null {
  const element =
    typeof document.elementFromPoint === "function"
      ? document.elementFromPoint(x, y)
      : null;
  const candidates = surfaces
    .filter((surface) =>
      element
        ? surface.el.contains(element)
        : contains(surface.el.getBoundingClientRect(), x, y),
    )
    .sort((a, b) => depth(b.el) - depth(a.el));
  for (const surface of candidates) {
    const target = surface.resolve(x, y);
    if (target) return { surface, target };
  }
  return null;
}

/** The element of a surface that scrolls: its own, else its first scrolling ancestor. */
export function surfaceScroller(
  surface: AgendaDropSurface,
): HTMLElement | null {
  if (surface.scroller) return surface.scroller;
  for (
    let node: HTMLElement | null = surface.el;
    node;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    const scrollsY =
      SCROLLING.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const scrollsX =
      SCROLLING.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (scrollsY || scrollsX) return node;
  }
  return null;
}

/** Pixels past an edge where dragging still scrolls; farther out (over the toolbar) it stops. */
export const AUTO_SCROLL_OUTSIDE = 48;

/**
 * Scroll speed along one axis: negative near `min`, positive near `max`,
 * none far outside (the pointer has left for another part of the page).
 */
export function edgeSpeed(position: number, min: number, max: number): number {
  if (position < min - AUTO_SCROLL_OUTSIDE) return 0;
  if (position > max + AUTO_SCROLL_OUTSIDE) return 0;
  const ramp = (distance: number) =>
    Math.round(
      AUTO_SCROLL_MAX_SPEED *
        Math.min(1, (AUTO_SCROLL_EDGE - distance) / AUTO_SCROLL_EDGE),
    );
  if (position < min + AUTO_SCROLL_EDGE)
    return -ramp(Math.max(0, position - min));
  if (position > max - AUTO_SCROLL_EDGE)
    return ramp(Math.max(0, max - position));
  return 0;
}

/** Where a surface shows: its own viewport, else its scroller's box. */
export function surfaceViewport(
  surface: AgendaDropSurface,
  scroller: HTMLElement,
): AgendaSurfaceViewport {
  return surface.viewport?.() ?? scroller.getBoundingClientRect();
}
