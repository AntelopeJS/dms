// Hit-testing a timeline: the row at a height, and what a point of a row
// is over (a time, a slot or a day) as the drop target the drag engine and
// the empty-slot clicks use.

import type { AgendaTimelineScale } from "../../../types/full-agenda";
import type { AgendaDropTarget } from "./agendaModel";
import { zonedWallClock } from "./agendaSlots";
import type { TimelineColumn, TimelineRow } from "./agendaTimelineLayout";

/** The row at a height of the rows' area, or `null` past the last one. */
export function rowAt(
  rows: readonly TimelineRow[],
  y: number,
): TimelineRow | null {
  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const row = rows[middle]!;
    if (y < row.top) high = middle - 1;
    else if (y >= row.top + row.height) low = middle + 1;
    else return row;
  }
  return null;
}

export interface TimelineTargetInput {
  columns: readonly TimelineColumn[];
  /** Fractional column index of the point. */
  position: number;
  scale: AgendaTimelineScale;
  resourceId: string | null;
  snapMinutes: number;
  timeZone: string;
}

/**
 * What a point of a row is over: a day with a time snapped down to
 * `snapMinutes` (by hour), a slot (by slot), or a day cell (by day).
 */
export function timelineTargetAt(
  input: TimelineTargetInput,
): AgendaDropTarget | null {
  const { columns } = input;
  if (!columns.length) return null;
  const index = Math.min(
    columns.length - 1,
    Math.max(0, Math.floor(input.position)),
  );
  const column = columns[index]!;
  const resource = input.resourceId ? { resourceId: input.resourceId } : {};
  if (input.scale === "day") {
    return { day: column.day, allDay: true, ...resource };
  }
  if (input.scale === "slot") {
    return {
      day: column.day,
      minutes: column.minutes,
      slotIndex: column.slotIndex ?? 0,
      ...resource,
    };
  }
  const fraction = Math.min(1, Math.max(0, input.position - index));
  const epoch = column.start + fraction * (column.end - column.start);
  const wall = zonedWallClock(Math.min(epoch, column.end - 1), input.timeZone);
  const snap = Math.max(1, input.snapMinutes);
  const minutes =
    wall.day === column.day
      ? Math.floor(wall.minutes / snap) * snap
      : column.minutes;
  return {
    day: column.day,
    minutes: Math.max(column.minutes, minutes),
    ...resource,
  };
}
