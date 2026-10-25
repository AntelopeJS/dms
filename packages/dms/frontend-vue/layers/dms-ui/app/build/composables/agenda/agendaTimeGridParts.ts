// The measured parts of a time grid: its CSS grid columns and which one a
// point is over, a placement read as a span the grid draws, the closed hours
// and backgrounds of a column, the hours of its gutter.

import type { AgendaOpenInterval } from "./agendaOpenHours";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type { AgendaPlacement } from "./agendaModel";
import type {
  AgendaGridColumn,
  AgendaPlacedSpan,
} from "./agendaTimeGridLayout";
import type { AgendaBackgroundSpan } from "./agendaBackgroundSpans";
import { backgroundAppliesTo } from "./agendaBackgroundSpans";
import {
  MINUTES_PER_DAY,
  addDays,
  zonedDayKey,
  zonedMinutes,
} from "./agendaTime";

/** Pixels of the hour gutter. */
export const GRID_GUTTER_WIDTH = 56;
/** Pixels of a folded group's placeholder column. */
export const FOLDED_COLUMN_WIDTH = 32;
const MINUTES_PER_HOUR = 60;

/** The resource part of a column's target: its resource, or the "No resource" marker. */
export interface AgendaColumnTargetPart {
  resourceId?: string;
  unassigned?: true;
}

export function columnTargetPart(
  column: AgendaGridColumn,
): AgendaColumnTargetPart {
  if (column.unassigned) return { unassigned: true };
  return column.resource ? { resourceId: column.resource.id } : {};
}

/** `grid-template-columns` of the grid: the gutter, then each column. */
export function gridTemplate(
  columns: AgendaGridColumn[],
  columnMinWidth: number,
): string {
  return [
    `${GRID_GUTTER_WIDTH}px`,
    ...columns.map((column) =>
      column.folded
        ? `${FOLDED_COLUMN_WIDTH}px`
        : `minmax(${columnMinWidth}px, 1fr)`,
    ),
  ].join(" ");
}

/** The width under which the grid scrolls sideways. */
export function gridMinWidth(
  columns: AgendaGridColumn[],
  columnMinWidth: number,
): number {
  return columns.reduce(
    (width, column) =>
      width + (column.folded ? FOLDED_COLUMN_WIDTH : columnMinWidth),
    GRID_GUTTER_WIDTH,
  );
}

/**
 * The column under a point `offsetX` pixels from the grid's left edge (the
 * gutter included) of a grid `width` wide; -1 over the gutter. The columns
 * that are not folded share the width left equally (`1fr`).
 */
export function gridColumnAt(
  columns: AgendaGridColumn[],
  offsetX: number,
  width: number,
): number {
  if (offsetX < GRID_GUTTER_WIDTH || !columns.length) return -1;
  const folded = columns.filter((column) => column.folded).length;
  const shared = columns.length - folded;
  const each = shared
    ? (width - GRID_GUTTER_WIDTH - folded * FOLDED_COLUMN_WIDTH) / shared
    : 0;
  let left = GRID_GUTTER_WIDTH;
  for (let index = 0; index < columns.length; index += 1) {
    left += columns[index]!.folded ? FOLDED_COLUMN_WIDTH : each;
    if (offsetX < left) return index;
  }
  return columns.length - 1;
}

/** A placement as the span the grid draws (a drag preview, a staged ghost). */
export function placementSpan(
  placement: AgendaPlacement,
  timeZone: string,
): AgendaPlacedSpan {
  const startDay = zonedDayKey(placement.start, timeZone);
  if (placement.allDay) {
    return {
      ...placement,
      startDay,
      endDay: addDays(zonedDayKey(placement.end, timeZone), -1),
      startMinutes: 0,
      endMinutes: 0,
    };
  }
  return {
    ...placement,
    startDay,
    endDay:
      placement.end > placement.start
        ? zonedDayKey(placement.end - 1, timeZone)
        : startDay,
    startMinutes: zonedMinutes(placement.start, timeZone),
    endMinutes: zonedMinutes(placement.end, timeZone),
  };
}

/** A stretch of a column, in minutes from its midnight. */
export interface AgendaMinutePiece {
  top: number;
  bottom: number;
}

/** The stretches of `dayStart` – `dayEnd` outside the open ones (all of it when closed). */
export function closedPieces(
  open: AgendaOpenInterval[],
  dayStart: number,
  dayEnd: number,
): AgendaMinutePiece[] {
  const pieces: AgendaMinutePiece[] = [];
  let cursor = dayStart;
  for (const { start, end } of open) {
    if (start > cursor)
      pieces.push({ top: cursor, bottom: Math.min(start, dayEnd) });
    cursor = Math.max(cursor, end);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) pieces.push({ top: cursor, bottom: dayEnd });
  return pieces.filter((piece) => piece.bottom > piece.top);
}

/** A background's stretch in a column. */
export interface AgendaBackgroundPiece extends AgendaMinutePiece {
  key: string;
  style: Record<string, string>;
  label?: BlockText;
  /** It covers whole days (its label also shows in the all-day row). */
  allDay: boolean;
}

/** The backgrounds behind a column, clipped to the hours shown. */
export function backgroundPieces(
  spans: AgendaBackgroundSpan[],
  column: AgendaGridColumn,
  dayStart: number,
  dayEnd: number,
  timeZone: string,
): AgendaBackgroundPiece[] {
  const day = column.day.key;
  const pieces: AgendaBackgroundPiece[] = [];
  spans.forEach((span, index) => {
    if (span.startDay > day || span.endDay < day) return;
    if (!backgroundAppliesTo(span, column.resource?.id ?? null)) return;
    const from = span.startDay === day ? zonedMinutes(span.start, timeZone) : 0;
    const endMinutes = zonedMinutes(span.end, timeZone);
    const to =
      span.endDay === day && endMinutes > 0 ? endMinutes : MINUTES_PER_DAY;
    const top = Math.max(from, dayStart);
    const bottom = Math.min(to, dayEnd);
    if (bottom <= top) return;
    const isAllDay =
      span.background.allDay === true || (from === 0 && to === MINUTES_PER_DAY);
    pieces.push({
      key: `${index}`,
      top,
      bottom,
      style: span.style,
      label: span.background.label,
      allDay: isAllDay,
    });
  });
  return pieces;
}

/** The hours labelled in the gutter (minutes from midnight). */
export function hourMarks(dayStart: number, dayEnd: number): number[] {
  const marks: number[] = [];
  for (
    let minutes = Math.ceil(dayStart / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
    minutes < dayEnd;
    minutes += MINUTES_PER_HOUR
  ) {
    marks.push(minutes);
  }
  return marks;
}

/** Every whole-day background of a day, laid together. */
export interface AgendaDayBackground {
  style: Record<string, string>;
  labels: BlockText[];
}

/**
 * The whole-day backgrounds of a day behind one resource (or the agenda):
 * their images layered (a holiday's tint under a closed day's hatching),
 * every label kept. `null` when none applies.
 */
export function dayBackground(
  spans: AgendaBackgroundSpan[],
  day: string,
  resourceId: string | null,
): AgendaDayBackground | null {
  const found = spans.filter(
    (span) =>
      span.startDay <= day &&
      span.endDay >= day &&
      backgroundAppliesTo(span, resourceId),
  );
  if (!found.length) return null;
  const images = found
    .map((span) => span.style.backgroundImage)
    .filter((image): image is string => Boolean(image));
  const style: Record<string, string> = Object.assign(
    {},
    ...found.map((span) => span.style),
  );
  if (images.length) style.backgroundImage = images.join(", ");
  const labels = found
    .map((span) => span.background.label)
    .filter((label): label is BlockText => label !== undefined && label !== "");
  return { style, labels };
}
