// Where instants fall along a timeline's columns: a fractional column
// index per instant, the stretch an event covers (cut at day breaks, its
// hidden ends flagged as continuing, a sliver kept when too thin to see).

import type {
  TimelineColumn,
  TimelinePlaced,
  TimelineSegment,
} from "./agendaTimelineLayout";

/** Positions closer than this are equal (float noise of fractions). */
const EPSILON = 1e-6;
/** The narrowest stretch drawn, in columns (a zero-length or hidden event). */
export const MIN_SPAN = 0.25;

/**
 * Where an instant falls along the columns, as a fractional column index:
 * inside a column, proportionally to the time elapsed in it; between two
 * columns (a break, the night), at the edge of the next one.
 */
export function columnPosition(
  columns: readonly TimelineColumn[],
  epochMs: number,
): number {
  let low = 0;
  let high = columns.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (columns[middle]!.start <= epochMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0) return 0;
  const column = columns[found]!;
  if (epochMs >= column.end) return found + 1;
  return found + (epochMs - column.start) / (column.end - column.start);
}

/**
 * Where an instant falls when a column shows it, else `null` (outside the
 * range, outside the shown hours, in a break between slots): the now line
 * is not drawn at the next column's edge.
 */
export function shownPosition(
  columns: readonly TimelineColumn[],
  epochMs: number,
): number | null {
  const position = columnPosition(columns, epochMs);
  const column = columns[Math.floor(position)];
  if (!column || epochMs < column.start || epochMs >= column.end) return null;
  return position;
}

/** Cuts a stretch at the breaks inside it. */
function splitSegments(
  from: number,
  to: number,
  breaks: readonly number[],
  clippedBefore: boolean,
  clippedAfter: boolean,
): TimelineSegment[] {
  const cuts = breaks.filter((at) => at > from + EPSILON && at < to - EPSILON);
  const edges = [from, ...cuts, to];
  return edges.slice(0, -1).map((start, index) => ({
    from: start,
    to: edges[index + 1]!,
    continuesBefore: index > 0 || clippedBefore,
    continuesAfter: index < edges.length - 2 || clippedAfter,
  }));
}

/** How a span is laid along the columns. */
export interface PlaceSpanOptions {
  /** A timeline by day: a timed span takes the whole days it touches. */
  wholeColumns?: boolean;
}

/** A start lies in no column (`[start, end)`): before the first, in a gap, after the last. */
function isStartHidden(
  columns: readonly TimelineColumn[],
  epochMs: number,
  position: number,
): boolean {
  const column = columns[Math.floor(position + EPSILON)];
  return !column || epochMs < column.start || epochMs >= column.end;
}

/** An end lies in no column (`(start, end]`). */
function isEndHidden(
  columns: readonly TimelineColumn[],
  epochMs: number,
  position: number,
): boolean {
  const column = columns[Math.ceil(position - EPSILON) - 1];
  return !column || epochMs <= column.start || epochMs > column.end;
}

/**
 * A stretch too thin to see (a zero-length event, one inside a break or
 * outside the shown hours) widened to `MIN_SPAN`, on the side of the nearer
 * column edge so it stays on its own day.
 */
function widen(
  columns: readonly TimelineColumn[],
  from: number,
  start: number,
  end: number,
): [number, number] {
  const count = columns.length;
  const at = Math.round(from);
  const isGap = Math.abs(from - at) <= EPSILON && at > 0 && at < count;
  const previous = columns[at - 1];
  const next = columns[at];
  const leansBack =
    isGap && previous && next && start - previous.end < next.start - end;
  const left = leansBack ? from - MIN_SPAN : Math.min(from, count - MIN_SPAN);
  return [Math.max(0, left), Math.max(0, left) + MIN_SPAN];
}

/**
 * The stretch an instant span covers along the columns, or `null` when it
 * lies outside the range. A part hidden by the shown hours, a break between
 * slots or the range's edges is flagged as continuing; a stretch too thin to
 * see keeps a sliver of `MIN_SPAN` of a column.
 */
export function placeSpan(
  columns: readonly TimelineColumn[],
  start: number,
  end: number,
  breaks: readonly number[],
  options: PlaceSpanOptions = {},
): Pick<TimelinePlaced, "from" | "to" | "segments"> | null {
  if (!columns.length) return null;
  const first = columns[0]!.start;
  const last = columns.at(-1)!.end;
  const safeEnd = Math.max(end, start);
  if (start >= last || safeEnd < first || (safeEnd === first && end > start)) {
    return null;
  }
  let from = columnPosition(columns, start);
  let to = columnPosition(columns, safeEnd);
  if (options.wholeColumns) {
    from = Math.floor(from + EPSILON);
    to = Math.max(from + 1, Math.ceil(to - EPSILON));
  }
  const clippedBefore = isStartHidden(
    columns,
    start,
    columnPosition(columns, start),
  );
  const clippedAfter =
    safeEnd > start &&
    isEndHidden(columns, safeEnd, columnPosition(columns, safeEnd));
  if (to - from < MIN_SPAN) [from, to] = widen(columns, from, start, safeEnd);
  return {
    from,
    to,
    segments: splitSegments(from, to, breaks, clippedBefore, clippedAfter),
  };
}
