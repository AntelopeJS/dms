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

const MINUTE_MS = 60_000;

type TargetRow = Pick<AgendaDropTarget, "resourceId" | "unassigned">;

/** The row part of a target: its resource, or the "No resource" marker. */
function rowPart(resourceId: string | null): TargetRow {
  return resourceId ? { resourceId } : { unassigned: true };
}

/**
 * A point of an hour column: the wall-clock minutes of its day snapped down
 * to `snapMinutes`, and the instant itself (snapped the same way), which
 * tells the first 02:30 of a fall-back day from the second.
 */
function hourTarget(
  column: TimelineColumn,
  fraction: number,
  input: TimelineTargetInput,
): AgendaDropTarget {
  const epoch = Math.min(
    column.end - 1,
    column.start + fraction * (column.end - column.start),
  );
  const wall = zonedWallClock(epoch, input.timeZone);
  const snap = Math.max(1, input.snapMinutes);
  const minutes =
    wall.day === column.day
      ? Math.floor(wall.minutes / snap) * snap
      : column.minutes;
  const snapped = epoch - (wall.minutes - minutes) * MINUTE_MS;
  return {
    day: column.day,
    minutes: Math.max(column.minutes, minutes),
    instant: Math.max(
      column.start,
      Math.floor(snapped / MINUTE_MS) * MINUTE_MS,
    ),
  };
}

/**
 * What a point of a row is over: a day with a time (by hour; snapped down
 * to `snapMinutes`, with the instant), a slot (by slot: `slotIndex` in the
 * day, `minutes` its start), or a day cell (by day). The row of the events
 * planned on no resource answers `unassigned`.
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
  const row = rowPart(input.resourceId);
  if (input.scale === "day") {
    return { day: column.day, allDay: true, ...row };
  }
  if (input.scale === "slot") {
    return {
      day: column.day,
      minutes: column.minutes,
      slotIndex: column.slotIndex ?? 0,
      ...row,
    };
  }
  const fraction = Math.min(1, Math.max(0, input.position - index));
  return { ...hourTarget(column, fraction, input), ...row };
}
