// The state of a time grid view (`day`, `week`, `days`, `resources`): its
// columns and headers, its metrics, the laid out events of each column, its
// gutter and lines, and where a point of its body is.

import { computed } from "vue";
import type { ComputedRef } from "vue";
import type { AgendaOverlap } from "../../../types/full-agenda";
import type {
  AgendaContext,
  AgendaDayKey,
  AgendaDropTarget,
  AgendaOccurrence,
  ResolvedAgendaOptions,
  ResolvedAgendaView,
} from "./agendaModel";
import {
  buildGridColumns,
  buildGridHeaders,
  isAllDayRowItem,
  layoutOverlaps,
  timedSegment,
  type AgendaGridColumn,
  type AgendaPlacedSpan,
  type AgendaTimedSegment,
} from "./agendaTimeGridLayout";
import {
  GRID_GUTTER_WIDTH,
  backgroundPieces,
  columnTargetPart,
  closedPieces,
  gridColumnAt,
  gridMinWidth,
  gridTemplate,
  hourMarks,
  placementSpan,
  type AgendaBackgroundPiece,
  type AgendaMinutePiece,
} from "./agendaTimeGridParts";
import { backgroundSpans } from "./agendaBackgroundSpans";
import { openIntervals } from "./agendaOpenHours";
import { parseSlots } from "./agendaSlots";
import {
  DAY_MS,
  MINUTES_PER_DAY,
  addDays,
  parseTimeOfDay,
  zonedEpoch,
} from "./agendaTime";

/** Pixels per minute come from `hourHeight`. */
const MINUTES_PER_HOUR = 60;
/** The shortest a block is drawn, in pixels, so a 5-minute event stays clickable. */
const MIN_BLOCK_PX = 18;
const DEFAULT_COLUMN_MIN_WIDTH = 72;

/** The vertical scale of the grid. */
export interface AgendaGridMetrics {
  dayStart: number;
  dayEnd: number;
  hourHeight: number;
  slotMinutes: number;
  /** Minutes a block is at least drawn over. */
  minMinutes: number;
  bodyHeight: number;
}

/** An event (or a staged ghost) placed in a column, in pixels and shares of its width. */
export interface AgendaGridItem {
  key: string;
  occurrence: AgendaOccurrence;
  top: number;
  height: number;
  left: number;
  width: number;
  z: number;
  isGhost: boolean;
  clippedStart: boolean;
  clippedEnd: boolean;
  /** `stack`: its level and the levels of its stack. */
  level?: number;
  depth?: number;
}

/** What one column draws. */
export interface AgendaGridColumnLayout {
  column: AgendaGridColumn;
  items: AgendaGridItem[];
  closed: AgendaMinutePiece[];
  backgrounds: AgendaBackgroundPiece[];
  isReadOnly: boolean;
}

/** A labelled line of the grid (an hour of the gutter). */
export interface AgendaGridMark {
  key: string;
  top: number;
  label: string;
}

interface StagedGhost extends AgendaPlacedSpan {
  key: string;
  occurrence: AgendaOccurrence;
}

/** Spans indexed by each day they touch. */
function byDay<T extends AgendaPlacedSpan>(spans: T[]): Map<AgendaDayKey, T[]> {
  const index = new Map<AgendaDayKey, T[]>();
  for (const span of spans) {
    for (let day = span.startDay; day <= span.endDay; day = addDays(day, 1)) {
      const list = index.get(day);
      if (list) list.push(span);
      else index.set(day, [span]);
    }
  }
  return index;
}

/** The vertical scale of a view, from its own hours or the block's. */
function gridMetrics(
  options: ResolvedAgendaOptions,
  view: ResolvedAgendaView,
): AgendaGridMetrics {
  const dayStart = parseTimeOfDay(view.dayStart, options.dayStartMinutes);
  const end = parseTimeOfDay(view.dayEnd, options.dayEndMinutes);
  const dayEnd = end > dayStart ? end : MINUTES_PER_DAY;
  const { hourHeight } = options;
  return {
    dayStart,
    dayEnd,
    hourHeight,
    slotMinutes: view.slotMinutes || options.slotMinutes,
    minMinutes: (MIN_BLOCK_PX / hourHeight) * MINUTES_PER_HOUR,
    bodyHeight: ((dayEnd - dayStart) / MINUTES_PER_HOUR) * hourHeight,
  };
}

/** Pixels from the top of the body of a time of day. */
const pixelsOf = (minutes: number, metrics: AgendaGridMetrics) =>
  ((minutes - metrics.dayStart) / MINUTES_PER_HOUR) * metrics.hourHeight;

/** Where staged changes moved occurrences from, as timed spans. */
function stagedGhosts(
  occurrences: AgendaOccurrence[],
  timeZone: string,
): StagedGhost[] {
  const ghosts: StagedGhost[] = [];
  for (const occurrence of occurrences) {
    if (!occurrence.ghost || occurrence.state !== "staged") continue;
    const span = placementSpan(occurrence.ghost, timeZone);
    if (isAllDayRowItem(span)) continue;
    ghosts.push({ ...span, key: `${occurrence.key}#ghost`, occurrence });
  }
  return ghosts;
}

/** What the items of a column are laid out from. */
interface ColumnItemsInput {
  timed: Map<AgendaDayKey, AgendaOccurrence[]>;
  ghosts: Map<AgendaDayKey, StagedGhost[]>;
  metrics: AgendaGridMetrics;
  overlap: AgendaOverlap;
}

/** A piece's vertical box in pixels. */
interface SegmentBox {
  top: number;
  height: number;
  clippedStart: boolean;
  clippedEnd: boolean;
}

function segmentBox(
  segment: AgendaTimedSegment<AgendaPlacedSpan>,
  metrics: AgendaGridMetrics,
): SegmentBox {
  const top = pixelsOf(segment.top, metrics);
  return {
    top,
    height: pixelsOf(segment.bottom, metrics) - top,
    clippedStart: segment.clippedStart,
    clippedEnd: segment.clippedEnd,
  };
}

/** The events of a column side by side or stacked, and the staged ghosts behind them. */
function columnItems(
  column: AgendaGridColumn,
  input: ColumnItemsInput,
): AgendaGridItem[] {
  const { dayStart, dayEnd, minMinutes } = input.metrics;
  const piece = <T extends AgendaPlacedSpan>(span: T) =>
    timedSegment(span, column, dayStart, dayEnd, minMinutes);
  const segments = (input.timed.get(column.day.key) ?? [])
    .map(piece)
    .filter((segment) => segment !== null);
  const boxes = layoutOverlaps(
    segments.map((segment) => ({
      key: segment.occurrence.key,
      top: segment.top,
      bottom: segment.bottom,
    })),
    input.overlap,
  );
  const items = segments.map((segment) => ({
    key: segment.occurrence.key,
    occurrence: segment.occurrence,
    ...segmentBox(segment, input.metrics),
    ...boxes.get(segment.occurrence.key)!,
    isGhost: false,
  }));
  const ghosts = (input.ghosts.get(column.day.key) ?? [])
    .map(piece)
    .filter((segment) => segment !== null)
    .map((segment) => ({
      key: segment.occurrence.key,
      occurrence: segment.occurrence.occurrence,
      ...segmentBox(segment, input.metrics),
      left: 0,
      width: 1,
      z: 0,
      isGhost: true,
    }));
  return [...ghosts, ...items];
}

/** The lines every slot and, stronger, every hour, as one background. */
function gridLinesStyle(metrics: AgendaGridMetrics): Record<string, string> {
  const { dayStart, slotMinutes, hourHeight } = metrics;
  const slotPx = (slotMinutes / MINUTES_PER_HOUR) * hourHeight;
  const firstSlot = Math.ceil(dayStart / slotMinutes) * slotMinutes;
  const firstHour = Math.ceil(dayStart / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
  return {
    backgroundImage:
      "linear-gradient(to bottom, var(--ui-border) 1px, transparent 1px), linear-gradient(to bottom, var(--ui-border-muted) 1px, transparent 1px)",
    backgroundSize: `100% ${hourHeight}px, 100% ${slotPx}px`,
    backgroundPosition: `0 ${pixelsOf(firstHour, metrics)}px, 0 ${pixelsOf(firstSlot, metrics)}px`,
  };
}

/** A grid body to resolve a point over. */
export interface AgendaGridBody {
  body: HTMLElement;
  /** Its scrolling area: the sticky gutter hides the first columns. */
  scroller: HTMLElement | null;
  columns: AgendaGridColumn[];
  metrics: AgendaGridMetrics;
}

/** The time under a point of a grid's body: raw minutes (the drag engine snaps). */
export function resolveGridBody(
  grid: AgendaGridBody,
  x: number,
  y: number,
): AgendaDropTarget | null {
  const rect = grid.body.getBoundingClientRect();
  const scrollerLeft = grid.scroller?.getBoundingClientRect().left;
  if (scrollerLeft !== undefined && x < scrollerLeft + GRID_GUTTER_WIDTH) {
    return null;
  }
  const index = gridColumnAt(grid.columns, x - rect.left, rect.width);
  const column = grid.columns[index];
  if (!column || column.folded) return null;
  const { dayStart, dayEnd, hourHeight } = grid.metrics;
  const minutes = dayStart + ((y - rect.top) / hourHeight) * MINUTES_PER_HOUR;
  return {
    day: column.day.key,
    minutes: Math.min(Math.max(minutes, dayStart), dayEnd - 1),
    ...columnTargetPart(column),
  };
}

/** The columns, headers and widths of a time grid view. */
function useGridColumns(ctx: AgendaContext) {
  const isResources = computed(() => ctx.view.value.type === "resources");
  // A boolean of its own: an event change rebuilds the columns only when it
  // flips, not on every move.
  const hasUnassigned = computed(
    () =>
      isResources.value &&
      ctx.occurrences.value.some(
        (occurrence) => !occurrence.resourceIds.length,
      ),
  );
  const columnInput = computed(() => ({
    days: ctx.range.value.days,
    resources: isResources.value ? ctx.resources.value : undefined,
    groups: ctx.resourceGroups.value,
    folded: ctx.foldedGroups.value,
    layout: ctx.view.value.resourceLayout,
    // Events planned on no resource get a column of their own.
    withUnassigned: hasUnassigned.value,
  }));
  const columns = computed(() => buildGridColumns(columnInput.value));
  const columnMinWidth = computed(
    () => ctx.options.value.raw.columnMinWidth ?? DEFAULT_COLUMN_MIN_WIDTH,
  );
  return {
    columns,
    headers: computed(() => buildGridHeaders(columns.value, columnInput.value)),
    template: computed(() => gridTemplate(columns.value, columnMinWidth.value)),
    minWidth: computed(() => gridMinWidth(columns.value, columnMinWidth.value)),
  };
}

/** The gutter's hours and the named slots' lines. */
function useGridMarks(
  ctx: AgendaContext,
  metrics: ComputedRef<AgendaGridMetrics>,
) {
  /** A day of the range that lasts 24 h, to write the hours (a DST day repeats or skips one). */
  const labelDay = computed(() => {
    const days = ctx.range.value.days;
    const plain = days.find((day) => day.end - day.start === DAY_MS);
    return plain?.key ?? addDays(days[0]?.key ?? ctx.today.value, 1);
  });
  const hours = computed<AgendaGridMark[]>(() =>
    hourMarks(metrics.value.dayStart, metrics.value.dayEnd).map((minutes) => ({
      key: `${minutes}`,
      top: pixelsOf(minutes, metrics.value),
      label: ctx.format.time(
        zonedEpoch(labelDay.value, minutes, ctx.options.value.timeZone),
      ),
    })),
  );
  const slotLines = computed(() =>
    parseSlots(ctx.options.value.slots)
      .filter(
        (slot) =>
          slot.startMinutes >= metrics.value.dayStart &&
          slot.startMinutes < metrics.value.dayEnd,
      )
      .map((slot) => ({
        key: slot.id,
        top: pixelsOf(slot.startMinutes, metrics.value),
        label: slot.label,
      })),
  );
  return { hours, slotLines };
}

/** The state of a time grid view, from the agenda's context. */
export function useAgendaTimeGrid(ctx: AgendaContext) {
  const options = computed(() => ctx.options.value);
  const timeZone = computed(() => options.value.timeZone);
  const metrics = computed(() => gridMetrics(options.value, ctx.view.value));
  const { columns, headers, template, minWidth } = useGridColumns(ctx);

  const timed = computed(() =>
    byDay(ctx.occurrences.value.filter((item) => !isAllDayRowItem(item))),
  );
  const ghosts = computed(() =>
    byDay(stagedGhosts(ctx.occurrences.value, timeZone.value)),
  );
  const backgrounds = computed(() =>
    backgroundSpans(ctx.backgrounds.value, timeZone.value),
  );
  const hasHours = (resourceId?: string) =>
    options.value.businessHours.length > 0 ||
    (ctx.resources.value.find((resource) => resource.id === resourceId)
      ?.businessHours?.length ?? 0) > 0;

  const columnLayouts = computed<AgendaGridColumnLayout[]>(() => {
    const input: ColumnItemsInput = {
      timed: timed.value,
      ghosts: ghosts.value,
      metrics: metrics.value,
      overlap: options.value.raw.overlap ?? "columns",
    };
    const { dayStart, dayEnd } = metrics.value;
    return columns.value.map((column) => {
      const resourceId = column.resource?.id;
      const isShaded = !column.folded && hasHours(resourceId);
      const open = isShaded
        ? openIntervals(
            ctx.hoursOn(column.day.weekday, resourceId),
            ctx.hoursOn((column.day.weekday + 6) % 7, resourceId),
          )
        : [];
      return {
        column,
        items: column.folded ? [] : columnItems(column, input),
        closed: isShaded ? closedPieces(open, dayStart, dayEnd) : [],
        backgrounds: column.folded
          ? []
          : backgroundPieces(
              backgrounds.value,
              column,
              dayStart,
              dayEnd,
              timeZone.value,
            ),
        isReadOnly: column.resource?.editable === false,
      };
    });
  });

  return {
    metrics,
    columns,
    headers,
    template,
    minWidth,
    columnLayouts,
    ...useGridMarks(ctx, metrics),
    linesStyle: computed(() => gridLinesStyle(metrics.value)),
    resolveBody: (
      body: HTMLElement,
      scroller: HTMLElement | null,
      x: number,
      y: number,
    ) =>
      resolveGridBody(
        { body, scroller, columns: columns.value, metrics: metrics.value },
        x,
        y,
      ),
  };
}
