import type { PreviewRect } from "./blockPreviewMessages";
import type { MockupPageState } from "./mockup";
import type { OverviewFrame } from "./mockupOverview";

/** What an arrow of the Overview stands for: a link between its pages, else a parent over its sub-page. */
export type OverviewArrowKind = "link" | "parent";

/**
 * The one arrow between two pages, its SVG path in the frames' own pixels. It
 * runs from `from` to `to`, with a head at each end when the pages link both
 * ways.
 */
export interface OverviewArrow {
  from: string;
  to: string;
  /** `link` when either page links to the other, drawn solid; `parent` when `from` is only the parent of `to`, drawn dashed. */
  kind: OverviewArrowKind;
  isTwoWay: boolean;
  path: string;
}

/**
 * How far from a frame's middle an arrow leaves it and reaches the next, in
 * the frames' own pixels: an arrow leaves right of the middle and arrives left
 * of it.
 */
const ANCHOR_OFFSET = 80;

/**
 * How far below a row an arrow between two of its frames arcs: more for
 * frames further apart, and never as far as the titles of the row below. The
 * titles of a row sit above it, which an arc there would cross.
 */
const ARC = { base: 80, perWidth: 0.1, most: 200 } as const;

const middleOf = (rect: PreviewRect) => rect.x + rect.width / 2;

/** The path from frame `from` to frame `to`: below the row between frames of one row, else from the edge of one facing the other. */
function arrowPath(from: PreviewRect, to: PreviewRect, offset: number): string {
  const x1 = middleOf(from) + offset;
  const x2 = middleOf(to) - offset;
  if (from.y === to.y) {
    const y1 = from.y + from.height;
    const y2 = to.y + to.height;
    const depth = Math.min(
      ARC.base + ARC.perWidth * Math.abs(x2 - x1),
      ARC.most,
    );
    const below = Math.max(y1, y2) + depth;
    return `M ${x1} ${y1} C ${x1} ${below} ${x2} ${below} ${x2} ${y2}`;
  }
  const isDown = to.y > from.y;
  const y1 = isDown ? from.y + from.height : from.y;
  const y2 = isDown ? to.y : to.y + to.height;
  const bend = (y2 - y1) / 2;
  return `M ${x1} ${y1} C ${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
}

/** What the arrows of a pair of pages hold: which way each link goes, and whether one page is the other's parent. */
interface Pair {
  first: string;
  second: string;
  firstLinksSecond: boolean;
  secondLinksFirst: boolean;
  parent?: string;
}

/**
 * The arrows between the frames laid out, one for each pair of pages that
 * link or nest. It is solid when either links to the other, with a head at
 * each end when both do, else dashed from the parent to its sub-page. A page
 * laid out nowhere, and a link of a page to itself, draw none.
 */
export function overviewArrows(
  frames: readonly OverviewFrame[],
  pages: readonly Pick<MockupPageState, "id" | "links" | "parent">[],
): OverviewArrow[] {
  const rects = new Map(frames.map((frame) => [frame.id, frame.rect]));
  const pairs = new Map<string, Pair>();
  const pairOf = (a: string, b: string): Pair | undefined => {
    if (a === b || !rects.has(a) || !rects.has(b)) return undefined;
    const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
    const known = pairs.get(key);
    if (known) return known;
    const created = {
      first: a,
      second: b,
      firstLinksSecond: false,
      secondLinksFirst: false,
    };
    pairs.set(key, created);
    return created;
  };
  for (const page of pages) {
    const parent = page.parent;
    const nested = parent === undefined ? undefined : pairOf(parent, page.id);
    if (nested) nested.parent = parent;
    for (const target of page.links ?? []) {
      const pair = pairOf(page.id, target);
      if (!pair) continue;
      if (pair.first === page.id) pair.firstLinksSecond = true;
      else pair.secondLinksFirst = true;
    }
  }
  return [...pairs.values()].flatMap((pair) => {
    const start = rects.get(pair.first);
    const end = rects.get(pair.second);
    if (!start || !end) return [];
    const isLink = pair.firstLinksSecond || pair.secondLinksFirst;
    const isBackward = isLink
      ? pair.secondLinksFirst && !pair.firstLinksSecond
      : pair.parent === pair.second;
    const [from, to, a, b] = isBackward
      ? [pair.second, pair.first, end, start]
      : [pair.first, pair.second, start, end];
    return [
      {
        from,
        to,
        kind: isLink ? "link" : "parent",
        isTwoWay: pair.firstLinksSecond && pair.secondLinksFirst,
        path: arrowPath(a, b, ANCHOR_OFFSET),
      } satisfies OverviewArrow,
    ];
  });
}

/**
 * How the Overview draws an arrow: `focused` when it touches the page in
 * focus, hovered or picked, `dimmed` when another page is in focus, else
 * `plain`.
 */
export type OverviewArrowEmphasis = "plain" | "focused" | "dimmed";

/** An arrow of the Overview with its emphasis. */
export interface ShownArrow extends OverviewArrow {
  emphasis: OverviewArrowEmphasis;
}

/**
 * Every arrow of the Overview, each with its emphasis for the page in
 * `focus`, the focused ones last so they are drawn over the others.
 */
export function shownArrows(
  arrows: readonly OverviewArrow[],
  focus: string | undefined,
): ShownArrow[] {
  const emphasisOf = (arrow: OverviewArrow): OverviewArrowEmphasis => {
    if (focus === undefined) return "plain";
    return arrow.from === focus || arrow.to === focus ? "focused" : "dimmed";
  };
  const shown = arrows.map((arrow) => ({
    ...arrow,
    emphasis: emphasisOf(arrow),
  }));
  return [
    ...shown.filter((arrow) => arrow.emphasis !== "focused"),
    ...shown.filter((arrow) => arrow.emphasis === "focused"),
  ];
}
