import type { PreviewRect } from "./blockPreviewMessages";
import { MOCKUP_WIDTHS } from "./mockup";
import type { PagePoint } from "./mockupPins";

/** The width every page is drawn at in the overview: the desktop frame's. */
export const OVERVIEW_FRAME_WIDTH = MOCKUP_WIDTHS.desktop;

/** The least height a page is drawn at in the overview, a desktop window's: a short page still fills a screen. */
export const OVERVIEW_MIN_HEIGHT = 800;

/** The most pages a row holds: past it, the pages wrap into rows of even length. */
export const OVERVIEW_MAX_COLUMNS = 8;

/** The space between two frames of a row, in the frames' own pixels. */
const COLUMN_GAP = 160;

/** The space between two rows, which holds the titles of the row below. */
const ROW_GAP = 400;

/** How far the overview zooms out and in: 100% draws a page at its real size. */
export const OVERVIEW_ZOOM = { min: 0.02, max: 2 } as const;

/** How many screen pixels of wheel turn the zoom by a factor of e. */
const WHEEL_PIXELS_PER_ZOOM = 100;

/** The wheel delta one event may turn the zoom by: a mouse notch zooms one step, a pinch follows the fingers. */
const WHEEL_ZOOM_CLAMP = 25;

const LINE_HEIGHT_PX = 16;

/** `WheelEvent.deltaMode` values, which count in lines and in pages. */
const DELTA_LINE = 1;
const DELTA_PAGE = 2;

/** A point of the overview's viewport, in CSS pixels from its top left corner. */
export interface ViewportPoint {
  x: number;
  y: number;
}

/** A point of the overview's canvas, in the frames' own pixels: a frame's top left corner is its page's (0, 0). */
export interface WorldPoint {
  x: number;
  y: number;
}

/** The size of the overview's viewport, in CSS pixels. */
export interface ViewportSize {
  width: number;
  height: number;
}

/** Where the overview looks from: the world's origin is drawn at viewport point (x, y), one world pixel `zoom` viewport pixels wide. */
export interface OverviewCamera {
  x: number;
  y: number;
  zoom: number;
}

/** A page of the mockup laid out on the overview's canvas. */
export interface OverviewFrame {
  id: string;
  rect: PreviewRect;
}

/** A page to lay out: its id, and the height its preview reported, when it did. */
export interface OverviewPage {
  id: string;
  height?: number;
}

/** How many pages each row holds: all of them up to the limit, else rows as even as can be. */
function columnsFor(count: number): number {
  if (count <= OVERVIEW_MAX_COLUMNS) return Math.max(count, 1);
  return Math.ceil(count / Math.ceil(count / OVERVIEW_MAX_COLUMNS));
}

/**
 * Lays the pages out left to right in their order, each at the desktop width
 * and at its height, the least one being {@link OVERVIEW_MIN_HEIGHT}. Past
 * {@link OVERVIEW_MAX_COLUMNS} pages, they wrap into rows of even length,
 * each row starting below the tallest frame of the row above.
 */
export function layoutFrames(pages: readonly OverviewPage[]): OverviewFrame[] {
  const columns = columnsFor(pages.length);
  const frames: OverviewFrame[] = [];
  let top = 0;
  for (let start = 0; start < pages.length; start += columns) {
    const row = pages.slice(start, start + columns).map((page, column) => ({
      id: page.id,
      rect: {
        x: column * (OVERVIEW_FRAME_WIDTH + COLUMN_GAP),
        y: top,
        width: OVERVIEW_FRAME_WIDTH,
        height: Math.max(page.height ?? 0, OVERVIEW_MIN_HEIGHT),
      },
    }));
    frames.push(...row);
    top += Math.max(...row.map((frame) => frame.rect.height)) + ROW_GAP;
  }
  return frames;
}

/** The space above a labelled section's first row, which holds its label over its pages' titles. */
const SECTION_GAP = 600;

/** A group of pages laid out together, under a label when it has one. */
export interface OverviewSection<Label> {
  /** None for the pages of a mockup without sections, which take no label. */
  label?: Label;
  pages: readonly OverviewPage[];
}

/** A section's label on the canvas: drawn above the first row of its pages, which starts at `y`. */
export interface OverviewSectionLabel<Label> {
  label: Label;
  y: number;
}

export interface OverviewLayout<Label> {
  frames: OverviewFrame[];
  labels: OverviewSectionLabel<Label>[];
}

/**
 * Lays each section out as {@link layoutFrames} lays the pages of a mockup,
 * one below the other in their order, a labelled section further below the
 * one above, so its label clears that section's frames. A section without
 * pages takes no room.
 */
export function layoutSections<Label>(
  sections: readonly OverviewSection<Label>[],
): OverviewLayout<Label> {
  const frames: OverviewFrame[] = [];
  const labels: OverviewSectionLabel<Label>[] = [];
  let top = 0;
  for (const section of sections) {
    if (!section.pages.length) continue;
    if (section.label !== undefined && frames.length) top += SECTION_GAP;
    const laid = layoutFrames(section.pages).map((frame) => ({
      ...frame,
      rect: { ...frame.rect, y: frame.rect.y + top },
    }));
    if (section.label !== undefined)
      labels.push({ label: section.label, y: top });
    frames.push(...laid);
    const bounds = framesBounds(laid);
    top = (bounds ? bounds.y + bounds.height : top) + ROW_GAP;
  }
  return { frames, labels };
}

/** The box around every frame; undefined without one. */
export function framesBounds(
  frames: readonly OverviewFrame[],
): PreviewRect | undefined {
  if (!frames.length) return undefined;
  const left = Math.min(...frames.map(({ rect }) => rect.x));
  const top = Math.min(...frames.map(({ rect }) => rect.y));
  const right = Math.max(...frames.map(({ rect }) => rect.x + rect.width));
  const bottom = Math.max(...frames.map(({ rect }) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function clampZoom(zoom: number): number {
  return Math.min(OVERVIEW_ZOOM.max, Math.max(OVERVIEW_ZOOM.min, zoom));
}

/** The world point drawn at a viewport point. */
export function toWorld(camera: OverviewCamera, at: ViewportPoint): WorldPoint {
  return {
    x: (at.x - camera.x) / camera.zoom,
    y: (at.y - camera.y) / camera.zoom,
  };
}

/** The camera at `zoom`, clamped, that keeps the world point under `at` where it is on the viewport. */
export function zoomAt(
  camera: OverviewCamera,
  zoom: number,
  at: ViewportPoint,
): OverviewCamera {
  const next = clampZoom(zoom);
  const world = toWorld(camera, at);
  return { x: at.x - world.x * next, y: at.y - world.y * next, zoom: next };
}

/** How much a wheel event moves, in CSS pixels, whatever unit it counts in. */
export function wheelPixels(
  event: Pick<WheelEvent, "deltaX" | "deltaY" | "deltaMode" | "shiftKey">,
  viewport: ViewportSize,
): ViewportPoint {
  const unit =
    event.deltaMode === DELTA_LINE
      ? LINE_HEIGHT_PX
      : event.deltaMode === DELTA_PAGE
        ? viewport.height
        : 1;
  const isSideways = event.shiftKey && event.deltaX === 0;
  return {
    x: (isSideways ? event.deltaY : event.deltaX) * unit,
    y: (isSideways ? 0 : event.deltaY) * unit,
  };
}

/** The factor a zooming wheel turn of `pixels` multiplies the zoom by: up zooms in. */
export function wheelZoomFactor(pixels: number): number {
  const turned = Math.min(
    WHEEL_ZOOM_CLAMP,
    Math.max(-WHEEL_ZOOM_CLAMP, pixels),
  );
  return Math.exp(-turned / WHEEL_PIXELS_PER_ZOOM);
}

/**
 * The camera that shows the whole of `bounds` inside the viewport, `padding`
 * pixels off each edge, centred, never past 100%, so a single small page is
 * drawn at its real size.
 */
export function fitCamera(
  bounds: PreviewRect,
  viewport: ViewportSize,
  padding: number,
): OverviewCamera {
  const width = Math.max(1, viewport.width - padding * 2);
  const height = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(
    Math.min(width / bounds.width, height / bounds.height, 1),
  );
  return {
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}

/** The pan, along one axis, that brings a span into the room between `padding` and `size - padding`. */
function panToShow(
  start: number,
  length: number,
  size: number,
  padding: number,
): number {
  const end = start + length;
  if (length > size - padding * 2 || start < padding) return padding - start;
  if (end > size - padding) return size - padding - end;
  return 0;
}

/**
 * The camera, at the same zoom, panned the least that shows `rect` with
 * `padding` around it, as a browser scrolls a focused element into view; a
 * rect larger than the viewport shows from its top left corner.
 */
export function revealCamera(
  camera: OverviewCamera,
  rect: PreviewRect,
  viewport: ViewportSize,
  padding: number,
): OverviewCamera {
  const { zoom } = camera;
  return {
    x:
      camera.x +
      panToShow(
        camera.x + rect.x * zoom,
        rect.width * zoom,
        viewport.width,
        padding,
      ),
    y:
      camera.y +
      panToShow(
        camera.y + rect.y * zoom,
        rect.height * zoom,
        viewport.height,
        padding,
      ),
    zoom,
  };
}

function contains(rect: PreviewRect, point: WorldPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** The page under a viewport point, and the point of its frame there; undefined between frames. */
export function pageAt(
  frames: readonly OverviewFrame[],
  camera: OverviewCamera,
  at: ViewportPoint,
): PagePoint | undefined {
  const world = toWorld(camera, at);
  const frame = frames.find(({ rect }) => contains(rect, world));
  if (!frame) return undefined;
  return {
    page: frame.id,
    point: { x: world.x - frame.rect.x, y: world.y - frame.rect.y },
  };
}

function overlaps(left: PreviewRect, right: PreviewRect): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

/**
 * The frames worth drawing live, nearest the middle of the view first: those
 * in view, and those within half a viewport of it, which panning reaches next.
 */
export function nearbyFrames(
  frames: readonly OverviewFrame[],
  camera: OverviewCamera,
  viewport: ViewportSize,
): string[] {
  const width = viewport.width / camera.zoom;
  const height = viewport.height / camera.zoom;
  const { x, y } = toWorld(camera, { x: 0, y: 0 });
  const reach = {
    x: x - width / 2,
    y: y - height / 2,
    width: width * 2,
    height: height * 2,
  };
  const middle = { x: x + width / 2, y: y + height / 2 };
  const distance = ({ rect }: OverviewFrame) =>
    Math.hypot(
      rect.x + rect.width / 2 - middle.x,
      rect.y + rect.height / 2 - middle.y,
    );
  return frames
    .filter(({ rect }) => overlaps(rect, reach))
    .sort((left, right) => distance(left) - distance(right))
    .map(({ id }) => id);
}

/**
 * Which page each live slot draws once the view moved. The first `capacity`
 * pages of `wanted` each hold a slot: a page keeps the slot it had, and a page
 * newly wanted takes a free slot, else a new one while there are fewer than
 * `capacity`, else the slot of the page wanted least. A slot is an iframe
 * already loaded, so the next page draws in it without a new one booting.
 */
export function assignSlots(
  slots: readonly (string | undefined)[],
  wanted: readonly string[],
  capacity: number,
): (string | undefined)[] {
  const kept = new Set(wanted.slice(0, capacity));
  const rank = (id: string | undefined) => {
    const index = id === undefined ? -1 : wanted.indexOf(id);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  };
  const next = [...slots];
  for (const id of kept) {
    if (next.includes(id)) continue;
    const free = next.indexOf(undefined);
    if (free >= 0) next[free] = id;
    else if (next.length < capacity) next.push(id);
    else {
      const spare = next
        .map((held, index) => ({ held, index }))
        .filter(({ held }) => held === undefined || !kept.has(held))
        .sort((left, right) => rank(right.held) - rank(left.held))[0];
      if (spare) next[spare.index] = id;
    }
  }
  return next;
}
