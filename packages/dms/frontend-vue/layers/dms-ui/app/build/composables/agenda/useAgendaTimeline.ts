// The state of a `timeline` view: its columns, header, rows, shading and
// the hit-test of a point, computed from the agenda context. The view and
// its rows only draw what this returns.

import { computed, type ComputedRef, type Ref } from "vue";
import type { AgendaResource } from "../../../types/full-agenda";
import type { AgendaContext, AgendaDropTarget } from "./agendaModel";
import {
  backgroundSpans,
  type AgendaBackgroundSpan,
} from "./agendaBackgroundSpans";
import { parseSlots, type ParsedAgendaSlot } from "./agendaSlots";
import {
  buildTimelineColumns,
  buildTimelineRows,
  shownPosition,
  dayBreaks,
  effectiveScale,
  timelineHeaderGroups,
  type TimelineColumn,
  type TimelineHeaderGroup,
  type TimelineMetrics,
  type TimelineRow,
  type PlaceSpanOptions,
} from "./agendaTimelineLayout";
import { rowAt, timelineTargetAt } from "./agendaTimelineHitTest";
import {
  backgroundShades,
  businessHourShades,
  type TimelineShade,
} from "./agendaTimelineShading";
import { MINUTES_PER_DAY, parseTimeOfDay } from "./agendaTime";

/** Pixels of the resource column of a timeline, as the contract defaults it. */
export const TIMELINE_RESOURCE_WIDTH = 200;
/** The resource column of a compact timeline, at most. */
export const TIMELINE_COMPACT_RESOURCE_WIDTH = 120;
/** Pixels under which a column does not shrink, as the contract defaults it. */
export const TIMELINE_COLUMN_MIN_WIDTH = 72;
/** Height of the two header levels together. */
export const TIMELINE_HEADER_HEIGHT = 56;

const METRICS: Record<"compact" | "comfortable", TimelineMetrics> = {
  comfortable: {
    laneHeight: 30,
    rowPadding: 5,
    minRowHeight: 48,
    groupHeight: 32,
  },
  compact: { laneHeight: 24, rowPadding: 3, minRowHeight: 36, groupHeight: 28 },
};

/** Comfortable lanes tall enough for a title over a subtitle ("Peters" / "DC-Dessin-AP1"). */
const TWO_LINE_METRICS: TimelineMetrics = {
  laneHeight: 44,
  rowPadding: 5,
  minRowHeight: 54,
  groupHeight: 32,
};

/** The elements a point is measured against. */
export interface TimelineElements {
  /** The scrolling viewport. */
  scroller: Ref<HTMLElement | null>;
  /** The rows' area, under the header (it scrolls with the content). */
  body: Ref<HTMLElement | null>;
}

export interface AgendaTimelineState {
  scale: ComputedRef<"hour" | "slot" | "day">;
  /** How spans are placed: whole days by day, slivers inside the range's bounds. */
  placement: ComputedRef<PlaceSpanOptions>;
  slots: ComputedRef<ParsedAgendaSlot[]>;
  columns: ComputedRef<TimelineColumn[]>;
  headerGroups: ComputedRef<TimelineHeaderGroup[]>;
  rows: ComputedRef<TimelineRow[]>;
  bodyHeight: ComputedRef<number>;
  metrics: ComputedRef<TimelineMetrics>;
  resourceWidth: ComputedRef<number>;
  /** Minimum pixel width of the time area. */
  trackMinWidth: ComputedRef<number>;
  /** The shading of each resource row, by row key. */
  shades: ComputedRef<Map<string, TimelineShade[]>>;
  /** Fractional position of an instant (for the now line), `null` outside. */
  positionOf: (epochMs: number) => number | null;
  /** What a point is over; `snap` rounds a time down to the snap minutes (a click), else raw (a drag). */
  targetAt: (
    clientX: number,
    clientY: number,
    snap: boolean,
  ) => AgendaDropTarget | null;
}

function useTimelineGeometry(ctx: AgendaContext) {
  const options = computed(() => ctx.options.value);
  const slots = computed(() => parseSlots(options.value.slots));
  const scale = computed(() =>
    effectiveScale(ctx.view.value.scale, slots.value),
  );
  const columns = computed(() =>
    buildTimelineColumns({
      days: ctx.range.value.days,
      scale: scale.value,
      slots: slots.value,
      dayStartMinutes: parseTimeOfDay(ctx.view.value.dayStart, 0),
      dayEndMinutes: parseTimeOfDay(ctx.view.value.dayEnd, MINUTES_PER_DAY),
      timeZone: options.value.timeZone,
    }),
  );
  const breaks = computed(() => dayBreaks(columns.value, scale.value));
  const headerGroups = computed(() =>
    timelineHeaderGroups(
      columns.value,
      ctx.range.value.days,
      scale.value,
      ctx.options.value.weekStartsOn,
    ),
  );
  // Two-line lanes when an event shown has a subtitle to show (L2); compact
  // density keeps one line.
  const metrics = computed(() => {
    if (options.value.raw.density === "compact") return METRICS.compact;
    const showsSubtitle = options.value.raw.eventContent?.subtitle !== false;
    const hasSubtitle = ctx.occurrences.value.some(
      (occurrence) => !!occurrence.event.subtitle,
    );
    return showsSubtitle && hasSubtitle
      ? TWO_LINE_METRICS
      : METRICS.comfortable;
  });
  const resourceWidth = computed(() => {
    const width =
      options.value.raw.resourceAreaWidth ?? TIMELINE_RESOURCE_WIDTH;
    return ctx.compact.value
      ? Math.min(width, TIMELINE_COMPACT_RESOURCE_WIDTH)
      : width;
  });
  const trackMinWidth = computed(
    () =>
      columns.value.length *
      (options.value.raw.columnMinWidth ?? TIMELINE_COLUMN_MIN_WIDTH),
  );
  return {
    slots,
    scale,
    columns,
    breaks,
    headerGroups,
    metrics,
    resourceWidth,
    trackMinWidth,
  };
}

type TimelineGeometry = ReturnType<typeof useTimelineGeometry>;

function useTimelineShading(ctx: AgendaContext, geometry: TimelineGeometry) {
  const spans = computed<AgendaBackgroundSpan[]>(() =>
    backgroundSpans(ctx.backgrounds.value, ctx.options.value.timeZone),
  );
  // Resources without hours of their own share the agenda's shading.
  const hourShades = computed(() => {
    const cache = new Map<string, TimelineShade[]>();
    return (resource: AgendaResource | null): TimelineShade[] => {
      const own = resource?.businessHours?.length ? resource.id : null;
      if (!own && !ctx.options.value.businessHours.length) return [];
      const key = own ?? "*";
      let shades = cache.get(key);
      if (!shades) {
        shades = businessHourShades(
          geometry.columns.value,
          ctx.range.value.days,
          geometry.scale.value,
          (weekday) => ctx.hoursOn(weekday, own ?? undefined),
          ctx.options.value.timeZone,
        );
        cache.set(key, shades);
      }
      return shades;
    };
  });
  const shadesOf = (resource: AgendaResource | null) => [
    ...hourShades.value(resource),
    ...backgroundShades(
      geometry.columns.value,
      spans.value,
      resource?.id ?? null,
    ),
  ];
  return { shadesOf };
}

function useTimelineHitTest(
  ctx: AgendaContext,
  geometry: TimelineGeometry,
  rows: ComputedRef<TimelineRow[]>,
  elements: TimelineElements,
) {
  return (
    clientX: number,
    clientY: number,
    snap: boolean,
  ): AgendaDropTarget | null => {
    const scroller = elements.scroller.value;
    const body = elements.body.value;
    if (!scroller || !body) return null;
    const viewport = scroller.getBoundingClientRect();
    // Over the sticky resource column or the sticky header: no time there.
    if (clientX < viewport.left + geometry.resourceWidth.value) return null;
    if (clientY < viewport.top + TIMELINE_HEADER_HEIGHT) return null;
    const rect = body.getBoundingClientRect();
    const trackWidth = rect.width - geometry.resourceWidth.value;
    if (trackWidth <= 0) return null;
    const x = clientX - rect.left - geometry.resourceWidth.value;
    const row = rowAt(rows.value, clientY - rect.top);
    if (!row || row.kind !== "resource") return null;
    const resource = row.resource;
    return timelineTargetAt({
      columns: geometry.columns.value,
      position: (x / trackWidth) * geometry.columns.value.length,
      scale: geometry.scale.value,
      resourceId: resource?.id ?? null,
      snapMinutes: snap ? ctx.options.value.snapMinutes : 1,
      timeZone: ctx.options.value.timeZone,
    });
  };
}

/** The layout of the timeline view, recomputed when the context changes. */
export function useAgendaTimeline(
  ctx: AgendaContext,
  elements: TimelineElements,
): AgendaTimelineState {
  const geometry = useTimelineGeometry(ctx);
  const placement = computed<PlaceSpanOptions>(() => ({
    wholeColumns: geometry.scale.value === "day",
    rangeStart: ctx.range.value.start,
    rangeEnd: ctx.range.value.end,
  }));
  const rows = computed(() =>
    buildTimelineRows({
      resources: ctx.resources.value,
      groups: ctx.resourceGroups.value,
      folded: ctx.foldedGroups.value,
      occurrences: ctx.occurrences.value,
      columns: geometry.columns.value,
      breaks: geometry.breaks.value,
      metrics: geometry.metrics.value,
      ...placement.value,
    }),
  );
  const bodyHeight = computed(() => {
    const last = rows.value.at(-1);
    return last ? last.top + last.height : 0;
  });
  const { shadesOf } = useTimelineShading(ctx, geometry);
  const shades = computed(() => {
    const byRow = new Map<string, TimelineShade[]>();
    for (const row of rows.value) {
      if (row.kind === "resource") byRow.set(row.key, shadesOf(row.resource));
    }
    return byRow;
  });
  const positionOf = (epochMs: number) =>
    shownPosition(geometry.columns.value, epochMs);
  return {
    scale: geometry.scale,
    placement,
    slots: geometry.slots,
    columns: geometry.columns,
    headerGroups: geometry.headerGroups,
    metrics: geometry.metrics,
    resourceWidth: geometry.resourceWidth,
    trackMinWidth: geometry.trackMinWidth,
    rows,
    bodyHeight,
    shades,
    positionOf,
    targetAt: useTimelineHitTest(ctx, geometry, rows, elements),
  };
}
