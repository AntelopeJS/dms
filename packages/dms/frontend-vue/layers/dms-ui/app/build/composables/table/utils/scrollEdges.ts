/** Which sides of a scroll area hide content the reader can scroll to. */
export interface ScrollEdges {
  start: boolean;
  end: boolean;
}

/** What {@link horizontalScrollEdges} reads off a scroll area. */
export interface HorizontalScroll {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

const EDGE_TOLERANCE_PX = 1;

/**
 * The sides of a table wider than its card that still hide columns: a phone
 * shows the first columns, and nothing else would tell that the rest are a
 * swipe away. The scroll position is read as the reader sees it, so a
 * right-to-left page (negative `scrollLeft`) reads the same.
 */
export function horizontalScrollEdges(area: HorizontalScroll): ScrollEdges {
  const hidden = area.scrollWidth - area.clientWidth;
  if (hidden <= EDGE_TOLERANCE_PX) return { start: false, end: false };
  const scrolled = Math.abs(area.scrollLeft);
  return {
    start: scrolled > EDGE_TOLERANCE_PX,
    end: scrolled < hidden - EDGE_TOLERANCE_PX,
  };
}
