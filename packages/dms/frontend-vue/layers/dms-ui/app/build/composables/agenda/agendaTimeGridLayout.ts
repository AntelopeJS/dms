// Pure layout of the time grids (`day`, `week`, `days`, `resources`): the
// columns and their header rows, the timed pieces of each column with their
// overlap geometry, and the all-day bars over the columns.

import type {
  AgendaOverlap,
  AgendaResource,
  AgendaResourceGroup,
  AgendaResourceLayout,
} from "../../../types/full-agenda";
import type { AgendaDay, AgendaOccurrence } from "./agendaModel";
import { MINUTES_PER_DAY, MINUTE_MS } from "./agendaTime";
import { packLanes } from "./agendaMonthLayout";

/** A column of the grid: a day, a resource on a day, or a folded group. */
export interface AgendaGridColumn {
  key: string;
  day: AgendaDay;
  resource?: AgendaResource;
  /** The group of the resource, or the folded group. */
  groupId?: string;
  /** A folded group's narrow placeholder: no events. */
  folded: boolean;
}

export type AgendaGridHeaderKind = "group" | "resource" | "day";

/** A cell of a header row, spanning `span` columns from `start`. */
export interface AgendaGridHeaderCell {
  key: string;
  kind: AgendaGridHeaderKind;
  start: number;
  span: number;
  column: AgendaGridColumn;
}

/** What the columns are built from. */
export interface AgendaGridColumnsInput {
  days: AgendaDay[];
  /** Absent: a column per day (`day`, `week`, `days`). */
  resources?: AgendaResource[];
  groups?: AgendaResourceGroup[];
  folded?: Set<string>;
  layout?: AgendaResourceLayout;
}

const NO_GROUP = "";

interface ResourceBlock {
  groupId: string;
  resources: AgendaResource[];
}

/** Resources gathered under their groups, in the groups' order, then the ungrouped. */
function resourceBlocks(
  resources: AgendaResource[],
  groups: AgendaResourceGroup[],
): ResourceBlock[] {
  const known = new Set(groups.map((group) => group.id));
  const blocks = groups.map((group) => ({
    groupId: group.id,
    resources: resources.filter((resource) => resource.group === group.id),
  }));
  const rest = resources.filter(
    (resource) => !resource.group || !known.has(resource.group),
  );
  return [
    ...blocks.filter((block) => block.resources.length),
    ...(rest.length ? [{ groupId: NO_GROUP, resources: rest }] : []),
  ];
}

function blockColumns(
  block: ResourceBlock,
  day: AgendaDay,
  isFolded: boolean,
): AgendaGridColumn[] {
  const groupId = block.groupId || undefined;
  if (isFolded) {
    return [
      { key: `${block.groupId}|folded|${day.key}`, day, groupId, folded: true },
    ];
  }
  return block.resources.map((resource) => ({
    key: `${resource.id}|${day.key}`,
    day,
    resource,
    groupId,
    folded: false,
  }));
}

/** The columns of a time grid, in the order they are drawn. */
export function buildGridColumns(
  input: AgendaGridColumnsInput,
): AgendaGridColumn[] {
  const { days, resources } = input;
  if (!resources) {
    return days.map((day) => ({ key: day.key, day, folded: false }));
  }
  const blocks = resourceBlocks(resources, input.groups ?? []);
  const isFolded = (block: ResourceBlock) =>
    block.groupId !== NO_GROUP && (input.folded?.has(block.groupId) ?? false);
  if (input.layout === "daysFirst") {
    return days.flatMap((day) =>
      blocks.flatMap((block) => blockColumns(block, day, isFolded(block))),
    );
  }
  // A folded group keeps one placeholder for the whole range.
  return blocks.flatMap((block) =>
    isFolded(block)
      ? blockColumns(block, days[0]!, true)
      : block.resources.flatMap((resource) =>
          days.flatMap((day) =>
            blockColumns({ ...block, resources: [resource] }, day, false),
          ),
        ),
  );
}

const HEADER_KEYS: Record<
  AgendaGridHeaderKind,
  (column: AgendaGridColumn) => string
> = {
  group: (column) => column.groupId ?? NO_GROUP,
  resource: (column) =>
    column.folded ? `folded:${column.groupId}` : (column.resource?.id ?? ""),
  day: (column) => column.day.key,
};

/** The header rows of the grid, outer level first. */
export function buildGridHeaders(
  columns: AgendaGridColumn[],
  input: Pick<AgendaGridColumnsInput, "resources" | "layout" | "days">,
): AgendaGridHeaderCell[][] {
  const hasGroups = columns.some((column) => column.groupId);
  const showDays = !input.resources || input.days.length > 1;
  const levels: AgendaGridHeaderKind[] = !input.resources
    ? ["day"]
    : input.layout === "daysFirst"
      ? ["day", "group", "resource"]
      : ["group", "resource", "day"];
  return levels
    .filter((kind) =>
      kind === "group" ? hasGroups : kind === "day" ? showDays : true,
    )
    .map((kind, depth, kinds) =>
      headerRow(columns, kind, kinds.slice(0, depth)),
    );
}

/** Consecutive columns equal on this level and every outer one share a cell. */
function headerRow(
  columns: AgendaGridColumn[],
  kind: AgendaGridHeaderKind,
  outer: AgendaGridHeaderKind[],
): AgendaGridHeaderCell[] {
  const cells: AgendaGridHeaderCell[] = [];
  const keyOf = (column: AgendaGridColumn) =>
    [...outer, kind].map((level) => HEADER_KEYS[level](column)).join("/");
  let lastKey = "";
  columns.forEach((column, index) => {
    const key = keyOf(column);
    const last = cells.at(-1);
    if (last && lastKey === key) last.span += 1;
    else
      cells.push({
        key: `${kind}:${index}`,
        kind,
        start: index,
        span: 1,
        column,
      });
    lastKey = key;
  });
  return cells;
}

/** What the grid reads of something placed: an occurrence, a staged ghost, a drag preview. */
export type AgendaPlacedSpan = Pick<
  AgendaOccurrence,
  | "start"
  | "end"
  | "allDay"
  | "resourceIds"
  | "startDay"
  | "endDay"
  | "startMinutes"
  | "endMinutes"
>;

/** A timed piece of a span inside one column. */
export interface AgendaTimedSegment<
  T extends AgendaPlacedSpan = AgendaOccurrence,
> {
  occurrence: T;
  /** Minutes from the column's midnight, clipped to the hours shown. */
  top: number;
  bottom: number;
  /** The event starts before / ends after what is drawn. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

/** A timed event of 24 h or more goes to the all-day row, as a bar. */
export function isAllDayRowItem(span: AgendaPlacedSpan): boolean {
  return span.allDay || span.end - span.start >= MINUTES_PER_DAY * MINUTE_MS;
}

/** The span belongs to the column (its day and its resource). */
export function inColumn(
  span: AgendaPlacedSpan,
  column: AgendaGridColumn,
): boolean {
  if (column.folded) return false;
  if (column.resource && !span.resourceIds.includes(column.resource.id)) {
    return false;
  }
  return span.startDay <= column.day.key && span.endDay >= column.day.key;
}

/**
 * The piece of a timed span drawn in a column, clipped to `dayStart` –
 * `dayEnd`; an event wholly outside them keeps a sliver at the edge. Wall
 * minutes are used, so a 25 h DST day draws its repeated hour once; a piece
 * the repeat would flatten takes its real length instead.
 */
export function timedSegment<T extends AgendaPlacedSpan>(
  span: T,
  column: AgendaGridColumn,
  dayStart: number,
  dayEnd: number,
  minMinutes: number,
): AgendaTimedSegment<T> | null {
  if (isAllDayRowItem(span) || !inColumn(span, column)) return null;
  const key = column.day.key;
  const from = span.startDay === key ? span.startMinutes : 0;
  let to =
    span.endDay === key && span.endMinutes > 0
      ? span.endMinutes
      : MINUTES_PER_DAY;
  if (span.startDay === span.endDay && to <= from) {
    to = Math.min(MINUTES_PER_DAY, from + (span.end - span.start) / MINUTE_MS);
  }
  if (to <= from) return null;
  const top = Math.min(Math.max(from, dayStart), dayEnd - minMinutes);
  const bottom = Math.max(Math.min(to, dayEnd), top + minMinutes);
  return {
    occurrence: span,
    top,
    bottom,
    clippedStart: from < dayStart || span.startDay < key,
    clippedEnd: to > dayEnd || span.endDay > key,
  };
}

/** Where a piece sits across its column: fractions of the column's width. */
export interface AgendaOverlapBox {
  left: number;
  width: number;
  /** Stacking order (later, deeper events on top). */
  z: number;
}

/** What the overlap layout reads of a piece. */
export interface AgendaOverlapItem {
  key: string;
  top: number;
  bottom: number;
}

/** The shift of each level of a `stack`, as a share of the column. */
const STACK_STEP = 0.14;
const STACK_MAX_INDENT = 0.6;

const byStart = (a: AgendaOverlapItem, b: AgendaOverlapItem) =>
  a.top - b.top ||
  b.bottom - b.top - (a.bottom - a.top) ||
  a.key.localeCompare(b.key);

const overlaps = (a: AgendaOverlapItem, b: AgendaOverlapItem) =>
  a.top < b.bottom && b.top < a.bottom;

/** Groups of pieces linked by overlaps, each laid out on its own. */
function clusters(items: AgendaOverlapItem[]): AgendaOverlapItem[][] {
  const groups: AgendaOverlapItem[][] = [];
  let end = -Infinity;
  for (const item of [...items].sort(byStart)) {
    if (item.top >= end) groups.push([]);
    groups.at(-1)!.push(item);
    end = Math.max(end, item.bottom);
  }
  return groups;
}

function layoutColumnsCluster(
  cluster: AgendaOverlapItem[],
  boxes: Map<string, AgendaOverlapBox>,
): void {
  const lanes: AgendaOverlapItem[][] = [];
  const laneOf = new Map<string, number>();
  for (const item of cluster) {
    let lane = lanes.findIndex((placed) =>
      placed.every((other) => !overlaps(other, item)),
    );
    if (lane === -1) lane = lanes.push([]) - 1;
    lanes[lane]!.push(item);
    laneOf.set(item.key, lane);
  }
  const count = lanes.length;
  for (const item of cluster) {
    const lane = laneOf.get(item.key)!;
    let span = 1;
    // A piece widens into the lanes on its right that stay free beside it.
    while (
      lane + span < count &&
      lanes[lane + span]!.every((other) => !overlaps(other, item))
    ) {
      span += 1;
    }
    boxes.set(item.key, {
      left: lane / count,
      width: span / count,
      z: lane + 1,
    });
  }
}

function layoutStackCluster(
  cluster: AgendaOverlapItem[],
  boxes: Map<string, AgendaOverlapBox>,
): void {
  const levels = new Map<string, number>();
  cluster.forEach((item, index) => {
    const under = cluster
      .slice(0, index)
      .filter((other) => overlaps(other, item));
    const level = under.length
      ? Math.max(...under.map((other) => levels.get(other.key)!)) + 1
      : 0;
    levels.set(item.key, level);
    const left = Math.min(level * STACK_STEP, STACK_MAX_INDENT);
    boxes.set(item.key, { left, width: 1 - left, z: level + 1 });
  });
}

const OVERLAP_LAYOUTS: Record<
  AgendaOverlap,
  (cluster: AgendaOverlapItem[], boxes: Map<string, AgendaOverlapBox>) => void
> = { columns: layoutColumnsCluster, stack: layoutStackCluster };

/**
 * Lays out the pieces of one column: `columns` puts overlapping events side
 * by side (each widening into free lanes), `stack` offsets each one over the
 * earlier ones it overlaps.
 */
export function layoutOverlaps(
  items: AgendaOverlapItem[],
  mode: AgendaOverlap,
): Map<string, AgendaOverlapBox> {
  const boxes = new Map<string, AgendaOverlapBox>();
  for (const cluster of clusters(items)) OVERLAP_LAYOUTS[mode](cluster, boxes);
  return boxes;
}

/** A bar of the all-day row over consecutive columns. */
export interface AgendaAllDayBar {
  occurrence: AgendaOccurrence;
  lane: number;
  first: number;
  last: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Runs of consecutive columns an occurrence covers (several in a `daysFirst` grid). */
function columnRuns(
  occurrence: AgendaOccurrence,
  columns: AgendaGridColumn[],
): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  columns.forEach((column, index) => {
    if (!inColumn(occurrence, column)) return;
    const last = runs.at(-1);
    if (last && last[1] === index - 1) last[1] = index;
    else runs.push([index, index]);
  });
  return runs;
}

/** The all-day row: all-day events and timed ones of 24 h or more, in lanes. */
export function layoutAllDayRow(
  occurrences: AgendaOccurrence[],
  columns: AgendaGridColumn[],
): { bars: AgendaAllDayBar[]; lanes: number } {
  const pieces = occurrences
    .filter(isAllDayRowItem)
    .flatMap((occurrence) =>
      columnRuns(occurrence, columns).map(([first, last]) => ({
        key: `${occurrence.key}#${first}`,
        first,
        last,
        occurrence,
      })),
    )
    .sort(
      (a, b) =>
        a.first - b.first ||
        b.last - b.first - (a.last - a.first) ||
        a.occurrence.start - b.occurrence.start,
    );
  const lanes = packLanes(pieces);
  const bars = pieces.map((piece) => {
    const days = [columns[piece.first]!.day, columns[piece.last]!.day];
    return {
      occurrence: piece.occurrence,
      lane: lanes.get(piece.key)!,
      first: piece.first,
      last: piece.last,
      continuesBefore: piece.occurrence.startDay < days[0]!.key,
      continuesAfter: piece.occurrence.endDay > days[1]!.key,
    };
  });
  return {
    bars,
    lanes: bars.reduce((max, bar) => Math.max(max, bar.lane + 1), 0),
  };
}
