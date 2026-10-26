// What the two layouts of a `year` view share: the months laid out from the
// context, the pending `twoClicks` range under the pointer, the drag
// preview's days, the clicks on a day, and the tooltip of a day.

import { computed, ref, type ComputedRef, type Ref } from "vue";
import type {
  AgendaContext,
  AgendaDayKey,
  AgendaOccurrence,
} from "./agendaModel";
import { backgroundSpans } from "./agendaBackgroundSpans";
import {
  buildYearMonths,
  buildYearPlanner,
  inPendingRange,
  pendingRange,
  type YearDayCell,
  type YearMonthGrid,
  type YearPendingRange,
  type YearPlannerMonth,
} from "./agendaYearLayout";
import { zonedDayKey } from "./agendaTime";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/** Views a click on a busy day of a small month moves to, the first offered wins. */
const DAY_VIEW_PREFERENCE = ["day", "list", "week", "month"] as const;

export interface AgendaYearState {
  planner: ComputedRef<YearPlannerMonth[]>;
  months: ComputedRef<YearMonthGrid[]>;
  /** The day under the pointer while a `twoClicks` range waits for its last day. */
  hoverDay: Ref<AgendaDayKey | null>;
  /** The pointer is over a day (`null`: it left the year). */
  hover: (day: AgendaDayKey | null) => void;
  pending: ComputedRef<YearPendingRange | null>;
  /** The days the drag preview covers, and whether a drop there is refused. */
  previewRange: ComputedRef<(YearPendingRange & { valid: boolean }) | null>;
  inPending: (day: AgendaDayKey | null) => boolean;
  /** "28/10/2026 · Congé · Toussaint". */
  titleOf: (cell: YearDayCell) => string;
  /** A day as `dd/mm/yyyy` in the reader's locale. */
  numericDay: (day: AgendaDayKey) => string;
  /** A click (or double click) on a day: picks a range, opens its event, or reaches `clickEmpty`. */
  clickDay: (cell: YearDayCell, double: boolean, opensEvents: boolean) => void;
  /** pointerdown on a day: drags its event, or starts a range on an empty one. */
  pressDay: (event: PointerEvent, cell: YearDayCell) => void;
  /** What a point is over, from the `data-agenda-day` of the cell under it. */
  resolvePoint: (
    clientX: number,
    clientY: number,
  ) => { day: AgendaDayKey; allDay: true } | null;
}

function useYearDayText(ctx: AgendaContext) {
  const { processText } = useComposedText();
  const numeric = computed(
    () =>
      new Intl.DateTimeFormat(ctx.format.locale.value, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }),
  );
  const numericDay = (day: AgendaDayKey) =>
    numeric.value.format(new Date(`${day}T12:00:00Z`));
  const titleOf = (cell: YearDayCell): string => {
    if (!cell.day) return "";
    const parts = [numericDay(cell.day)];
    for (const occurrence of cell.occurrences)
      parts.push(occurrence.event.title);
    for (const span of cell.backgrounds) {
      if (span.background.label) parts.push(processText(span.background.label));
    }
    return parts.join(" · ");
  };
  return { numericDay, titleOf };
}

function goToDay(ctx: AgendaContext, day: AgendaDayKey): void {
  const types = new Set(ctx.views.value.map((view) => view.type));
  const target = DAY_VIEW_PREFERENCE.find((type) => types.has(type));
  ctx.goTo(day, target);
}

function useYearClicks(ctx: AgendaContext) {
  const firstOccurrence = (cell: YearDayCell): AgendaOccurrence | undefined =>
    cell.occurrences[0];

  const clickDay = (
    cell: YearDayCell,
    double: boolean,
    opensEvents: boolean,
  ) => {
    if (!cell.day) return;
    const occurrence = firstOccurrence(cell);
    if (ctx.rangeAnchor.value || !occurrence) {
      ctx.clickEmpty({ day: cell.day, allDay: true }, double);
      return;
    }
    if (double) return;
    if (opensEvents || cell.occurrences.length === 1) ctx.open(occurrence);
    else goToDay(ctx, cell.day);
  };

  const pressDay = (event: PointerEvent, cell: YearDayCell) => {
    if (!cell.day || event.button !== 0) return;
    const occurrence = firstOccurrence(cell);
    if (occurrence && !ctx.rangeAnchor.value) {
      ctx.drag.startOccurrence(event, occurrence, "move");
      return;
    }
    ctx.drag.startEmpty(event, { day: cell.day, allDay: true });
  };
  return { clickDay, pressDay };
}

/** The state of a year view. */
export function useAgendaYear(ctx: AgendaContext): AgendaYearState {
  const spans = computed(() =>
    backgroundSpans(
      ctx.backgrounds.value.filter(
        (background) => !background.resourceIds?.length,
      ),
      ctx.options.value.timeZone,
    ),
  );
  const input = computed(() => ({
    from: ctx.range.value.from,
    today: ctx.today.value,
    occurrences: ctx.occurrences.value,
    backgrounds: spans.value,
  }));
  const planner = computed(() => buildYearPlanner(input.value));
  const months = computed(() =>
    buildYearMonths({
      ...input.value,
      weekStartsOn: ctx.options.value.weekStartsOn,
    }),
  );
  const hoverDay = ref<AgendaDayKey | null>(null);
  const pending = computed(() =>
    pendingRange(ctx.rangeAnchor.value?.day, hoverDay.value),
  );
  const previewRange = computed(() => {
    const preview = ctx.drag.preview.value;
    if (!preview || preview.toPending) return null;
    const zone = ctx.options.value.timeZone;
    return {
      from: zonedDayKey(preview.start, zone),
      to: zonedDayKey(Math.max(preview.start, preview.end - 1), zone),
      valid: preview.valid,
    };
  });
  const resolvePoint = (clientX: number, clientY: number) => {
    const hit = document.elementFromPoint?.(
      clientX,
      clientY,
    ) as HTMLElement | null;
    const day =
      hit?.closest?.<HTMLElement>("[data-agenda-day]")?.dataset.agendaDay;
    return day ? { day, allDay: true as const } : null;
  };
  return {
    planner,
    months,
    hoverDay,
    hover: (day) => {
      hoverDay.value = day;
    },
    pending,
    previewRange,
    inPending: (day) => inPendingRange(day, pending.value),
    ...useYearDayText(ctx),
    ...useYearClicks(ctx),
    resolvePoint,
  };
}
