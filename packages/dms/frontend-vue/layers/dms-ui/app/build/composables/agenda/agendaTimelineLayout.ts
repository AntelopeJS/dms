// The layout of a `timeline`: its columns (an hour, a named slot or a day
// each), where an instant falls along them, the rows of resources and
// resource groups, events placed in lanes so overlapping ones stack, and the
// hit-test a drop uses. Pure: the view feeds it the context's values.
//
// Columns are instant spans. A position along the timeline is a fractional
// column index, so an hour column that lasts two hours on a DST day, a lunch
// break between two slots, or the night between two days all map without a
// special case: an instant in a gap sits at the next column's edge.

import type {
  AgendaResource,
  AgendaResourceGroup,
  AgendaTimelineScale,
} from "../../../types/full-agenda";
import type { AgendaDay, AgendaDayKey, AgendaOccurrence } from "./agendaModel";
import type { ParsedAgendaSlot } from "./agendaSlots";
import { MINUTES_PER_DAY, zonedEpoch } from "./agendaTime";

const HOUR_MINUTES = 60;
/** Positions closer than this are equal (float noise of fractions). */
const EPSILON = 1e-6;

/** One column of a timeline. */
export interface TimelineColumn {
  index: number;
  day: AgendaDayKey;
  /** Index of its day in the range's days. */
  dayIndex: number;
  start: number;
  end: number;
  /** Wall-clock minutes of its start (0 for a day column). */
  minutes: number;
  /** Timeline by slot: the slot's index in the day. */
  slotIndex?: number;
  weekday: number;
  isToday: boolean;
  /** The first column of its day. */
  firstOfDay: boolean;
}

export interface TimelineColumnsInput {
  days: readonly AgendaDay[];
  scale: AgendaTimelineScale;
  slots: readonly ParsedAgendaSlot[];
  dayStartMinutes: number;
  dayEndMinutes: number;
  timeZone: string;
}

/** A run of columns under one header cell of the top level (a day, a week). */
export interface TimelineHeaderGroup {
  key: string;
  first: number;
  count: number;
  day: AgendaDay;
}

/** A part of an event drawn in one stretch (a day's part of a long one). */
export interface TimelineSegment {
  from: number;
  to: number;
  /** It runs on from an earlier day, or from before the range. */
  continuesBefore: boolean;
  /** It runs on into a later day, or past the range. */
  continuesAfter: boolean;
}

/** An occurrence placed on a row: its lane and its segments. */
export interface TimelinePlaced {
  key: string;
  occurrence: AgendaOccurrence;
  /** The staged ghost of the occurrence, at its place before the change. */
  ghost: boolean;
  lane: number;
  from: number;
  to: number;
  segments: TimelineSegment[];
}

export interface TimelineMetrics {
  laneHeight: number;
  rowPadding: number;
  minRowHeight: number;
  groupHeight: number;
}

interface TimelineRowBase {
  key: string;
  top: number;
  height: number;
}

export interface TimelineResourceRow extends TimelineRowBase {
  kind: "resource";
  /** `null`: the row of the events planned on no resource. */
  resource: AgendaResource | null;
  items: TimelinePlaced[];
  laneCount: number;
}

export interface TimelineGroupRow extends TimelineRowBase {
  kind: "group";
  group: AgendaResourceGroup;
  /** The resources it holds. */
  count: number;
  folded: boolean;
}

export type TimelineRow = TimelineResourceRow | TimelineGroupRow;

export interface TimelineRowsInput {
  resources: readonly AgendaResource[];
  groups: readonly AgendaResourceGroup[];
  folded: ReadonlySet<string>;
  occurrences: readonly AgendaOccurrence[];
  columns: readonly TimelineColumn[];
  /** Column indices where a segment breaks (each day's first column but the first). */
  breaks: readonly number[];
  metrics: TimelineMetrics;
}

/** The scale a view draws at, `slot` falling back to `hour` without slots. */
export function effectiveScale(
  scale: AgendaTimelineScale,
  slots: readonly ParsedAgendaSlot[],
): AgendaTimelineScale {
  return scale === "slot" && !slots.length ? "hour" : scale;
}

function dayColumns(
  day: AgendaDay,
  dayIndex: number,
  input: TimelineColumnsInput,
): Omit<TimelineColumn, "index" | "firstOfDay">[] {
  const base = {
    day: day.key,
    dayIndex,
    weekday: day.weekday,
    isToday: day.isToday,
  };
  const zone = input.timeZone;
  if (input.scale === "day") {
    return [{ ...base, start: day.start, end: day.end, minutes: 0 }];
  }
  if (input.scale === "slot") {
    return input.slots.map((slot, slotIndex) => ({
      ...base,
      slotIndex,
      minutes: slot.startMinutes,
      start: zonedEpoch(day.key, slot.startMinutes, zone),
      end: zonedEpoch(day.key, slot.endMinutes, zone),
    }));
  }
  const from = Math.max(0, input.dayStartMinutes);
  const to = Math.min(MINUTES_PER_DAY, input.dayEndMinutes);
  const columns: Omit<TimelineColumn, "index" | "firstOfDay">[] = [];
  for (let minutes = from; minutes < to; minutes += HOUR_MINUTES) {
    const end = Math.min(to, minutes + HOUR_MINUTES);
    columns.push({
      ...base,
      minutes,
      start: zonedEpoch(day.key, minutes, zone),
      end: zonedEpoch(day.key, end, zone),
    });
  }
  return columns;
}

/**
 * The columns of a timeline over the days shown. A column a DST change
 * skips (02:00 on a spring-forward day) is left out; the hour a fall-back
 * day repeats stays in its column, which lasts two hours.
 */
export function buildTimelineColumns(
  input: TimelineColumnsInput,
): TimelineColumn[] {
  const columns: TimelineColumn[] = [];
  input.days.forEach((day, dayIndex) => {
    const own = dayColumns(day, dayIndex, input).filter(
      (column) => column.end > column.start,
    );
    own.forEach((column, position) => {
      columns.push({
        ...column,
        index: columns.length,
        firstOfDay: position === 0,
      });
    });
  });
  return columns;
}

/** The column indices where a new day starts, the first one left out. */
export function dayBreaks(
  columns: readonly TimelineColumn[],
  scale: AgendaTimelineScale,
): number[] {
  if (scale === "day") return [];
  return columns
    .filter((column) => column.firstOfDay && column.index > 0)
    .map((column) => column.index);
}

/**
 * The top level of the header: a cell per day over its hours or slots; a
 * cell per week over the days of a timeline by day.
 */
export function timelineHeaderGroups(
  columns: readonly TimelineColumn[],
  days: readonly AgendaDay[],
  scale: AgendaTimelineScale,
): TimelineHeaderGroup[] {
  const groups: TimelineHeaderGroup[] = [];
  for (const column of columns) {
    const day = days[column.dayIndex]!;
    const key = scale === "day" ? `${day.year}-W${day.week}` : `${column.day}`;
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.count += 1;
      continue;
    }
    groups.push({ key, first: column.index, count: 1, day });
  }
  return groups;
}

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

/**
 * The stretch an instant span covers along the columns, or `null` when it
 * covers none (outside the range, inside a gap).
 */
export function placeSpan(
  columns: readonly TimelineColumn[],
  start: number,
  end: number,
  breaks: readonly number[],
): Pick<TimelinePlaced, "from" | "to" | "segments"> | null {
  if (!columns.length) return null;
  const from = columnPosition(columns, start);
  const to = columnPosition(columns, Math.max(end, start + 1));
  if (to - from <= EPSILON) return null;
  const clippedBefore = start < columns[0]!.start;
  const clippedAfter = end > columns.at(-1)!.end;
  return {
    from,
    to,
    segments: splitSegments(from, to, breaks, clippedBefore, clippedAfter),
  };
}

/**
 * Gives each placed occurrence the first lane free at its start, the
 * earlier and the longer first: overlapping events stack, the row growing
 * one lane per level. Returns the number of lanes used.
 */
export function assignLanes(items: TimelinePlaced[]): number {
  items.sort((a, b) => a.from - b.from || b.to - a.to);
  const laneEnds: number[] = [];
  for (const item of items) {
    let lane = laneEnds.findIndex((end) => end <= item.from + EPSILON);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = item.to;
    item.lane = lane;
  }
  return laneEnds.length;
}

const UNASSIGNED = "\u0000none";

function occurrencesByResource(
  occurrences: readonly AgendaOccurrence[],
): Map<string, AgendaOccurrence[]> {
  const byResource = new Map<string, AgendaOccurrence[]>();
  const add = (id: string, occurrence: AgendaOccurrence) => {
    const list = byResource.get(id);
    if (list) list.push(occurrence);
    else byResource.set(id, [occurrence]);
  };
  for (const occurrence of occurrences) {
    if (!occurrence.resourceIds.length) add(UNASSIGNED, occurrence);
    for (const id of occurrence.resourceIds) add(id, occurrence);
  }
  return byResource;
}

function ghostsByResource(
  occurrences: readonly AgendaOccurrence[],
): Map<string, AgendaOccurrence[]> {
  const ghosts = occurrences
    .filter((occurrence) => occurrence.ghost)
    .map((occurrence) => ({
      ...occurrence,
      ...occurrence.ghost!,
    }));
  return occurrencesByResource(ghosts);
}

function placeAll(
  occurrences: readonly AgendaOccurrence[],
  ghost: boolean,
  input: TimelineRowsInput,
): TimelinePlaced[] {
  const placed: TimelinePlaced[] = [];
  for (const occurrence of occurrences) {
    const span = placeSpan(
      input.columns,
      occurrence.start,
      occurrence.end,
      input.breaks,
    );
    if (!span) continue;
    const key = ghost ? `${occurrence.key}#ghost` : occurrence.key;
    placed.push({ key, occurrence, ghost, lane: 0, ...span });
  }
  return placed;
}

function rowHeight(laneCount: number, metrics: TimelineMetrics): number {
  const lanes = laneCount * metrics.laneHeight + 2 * metrics.rowPadding;
  return Math.max(metrics.minRowHeight, lanes);
}

interface RowBuilder {
  rows: TimelineRow[];
  top: number;
}

function pushResourceRow(
  builder: RowBuilder,
  resource: AgendaResource | null,
  items: TimelinePlaced[],
  metrics: TimelineMetrics,
): void {
  const laneCount = assignLanes(items);
  const height = rowHeight(laneCount, metrics);
  builder.rows.push({
    kind: "resource",
    key: resource ? `r:${resource.id}` : "r:none",
    resource,
    items,
    laneCount,
    top: builder.top,
    height,
  });
  builder.top += height;
}

/** The groups of the resources, in the order declared, then the undeclared ones. */
function orderedGroups(
  resources: readonly AgendaResource[],
  groups: readonly AgendaResourceGroup[],
): AgendaResourceGroup[] {
  const used = new Set(
    resources.map((resource) => resource.group).filter(Boolean) as string[],
  );
  const declared = groups.filter((group) => used.has(group.id));
  const known = new Set(declared.map((group) => group.id));
  const undeclared = [...used]
    .filter((id) => !known.has(id))
    .map((id) => ({ id, label: id }));
  return [...declared, ...undeclared];
}

/**
 * The rows of a timeline: the resources of no group first, then each group
 * (a folding header with its count, its resources unless folded), then a
 * row for the events planned on no resource when some are shown. Without
 * resources, one row holds every event.
 */
export function buildTimelineRows(input: TimelineRowsInput): TimelineRow[] {
  const byResource = occurrencesByResource(input.occurrences);
  const ghosts = ghostsByResource(input.occurrences);
  const builder: RowBuilder = { rows: [], top: 0 };
  const itemsOf = (id: string) => [
    ...placeAll(ghosts.get(id) ?? [], true, input),
    ...placeAll(byResource.get(id) ?? [], false, input),
  ];
  const addResource = (resource: AgendaResource) =>
    pushResourceRow(builder, resource, itemsOf(resource.id), input.metrics);

  const groups = orderedGroups(input.resources, input.groups);
  const groupIds = new Set(groups.map((group) => group.id));
  input.resources
    .filter((resource) => !resource.group || !groupIds.has(resource.group))
    .forEach(addResource);
  for (const group of groups) {
    const members = input.resources.filter((r) => r.group === group.id);
    const folded = input.folded.has(group.id);
    builder.rows.push({
      kind: "group",
      key: `g:${group.id}`,
      group,
      count: members.length,
      folded,
      top: builder.top,
      height: input.metrics.groupHeight,
    });
    builder.top += input.metrics.groupHeight;
    if (!folded) members.forEach(addResource);
  }
  const unassigned = itemsOf(UNASSIGNED);
  if (unassigned.length || !input.resources.length) {
    pushResourceRow(builder, null, unassigned, input.metrics);
  }
  return builder.rows;
}
