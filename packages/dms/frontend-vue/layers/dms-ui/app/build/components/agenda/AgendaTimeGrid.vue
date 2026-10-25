<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AgendaDropTarget } from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { useAgendaTimeGrid } from "../../composables/agenda/useAgendaTimeGrid";
import { GRID_GUTTER_WIDTH } from "../../composables/agenda/agendaTimeGridParts";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import AgendaAllDayRow from "./AgendaAllDayRow.vue";
import AgendaGridColumn from "./AgendaGridColumn.vue";
import AgendaGridHeader from "./AgendaGridHeader.vue";
import AgendaGridPreview from "./AgendaGridPreview.vue";

/**
 * The time grid of the `day`, `week`, `days` and `resources` views: a
 * column per day, or per resource and day (resources first or days first,
 * under folding group headers), a sticky header and hour gutter, the
 * all-day row, lines every `slotMinutes` and at each named slot, business
 * hours shaded per resource, backgrounds, the now line, overlapping events
 * side by side or stacked. It scrolls sideways when the columns would get
 * narrower than `columnMinWidth`, and opens scrolled to `scrollTime`.
 */
const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();
const grid = useAgendaTimeGrid(ctx);
const {
  metrics,
  columns,
  headers,
  template,
  minWidth,
  columnLayouts,
  hours,
  slotLines,
  linesStyle,
} = grid;

const MINUTES_PER_HOUR = 60;

const scrollerEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);

const showAllDayRow = computed(() => ctx.options.value.raw.allDayRow !== false);
const weekLabel = computed(() => {
  const first = ctx.range.value.days[0];
  if (!ctx.options.value.raw.weekNumbers || !first) return "";
  return t("dms.agenda.grid.week_short", { week: first.week });
});
/** The first column of each day carries the now line's dot. */
const isFirstOfDay = (index: number) =>
  index === 0 ||
  columns.value[index - 1]?.day.key !== columns.value[index]?.day.key;

function targetAt(x: number, y: number): AgendaDropTarget | null {
  return bodyEl.value
    ? grid.resolveBody(bodyEl.value, scrollerEl.value, x, y)
    : null;
}

/** A click on empty time is on the cell under it: its start, snapped down. */
function clickTarget(x: number, y: number): AgendaDropTarget | null {
  const target = targetAt(x, y);
  if (!target || target.minutes === undefined) return target;
  const snap = Math.max(ctx.options.value.snapMinutes, 1);
  return { ...target, minutes: Math.floor(target.minutes / snap) * snap };
}

function onPointerDown(pointer: PointerEvent): void {
  const target = targetAt(pointer.clientX, pointer.clientY);
  if (target) ctx.drag.startEmpty(pointer, target);
}

function onClick(click: MouseEvent, isDouble: boolean): void {
  const target = clickTarget(click.clientX, click.clientY);
  if (target) ctx.clickEmpty(target, isDouble);
}

function scrollToStart(): void {
  const scroller = scrollerEl.value;
  if (!scroller) return;
  const { dayStart, dayEnd, hourHeight } = metrics.value;
  const minutes = Math.min(
    Math.max(ctx.options.value.scrollMinutes, dayStart),
    dayEnd,
  );
  scroller.scrollTop = ((minutes - dayStart) / MINUTES_PER_HOUR) * hourHeight;
}

let unregister: (() => void) | undefined;
onMounted(() => {
  scrollToStart();
  if (!bodyEl.value) return;
  unregister = ctx.drag.registerSurface({
    el: bodyEl.value,
    resolve: targetAt,
    scroller: scrollerEl.value ?? undefined,
  });
});
onBeforeUnmount(() => unregister?.());
watch(() => [metrics.value.hourHeight, metrics.value.dayStart], scrollToStart, {
  flush: "post",
});
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    role="grid"
    :aria-label="ctx.format.title.value"
    data-agenda-time-grid
  >
    <div
      ref="scrollerEl"
      class="relative min-h-0 flex-1 overflow-auto overscroll-contain"
    >
      <div class="min-w-full" :style="{ minWidth: `${minWidth}px` }">
        <div class="sticky top-0 z-30 bg-(--ui-bg)">
          <AgendaGridHeader
            :rows="headers"
            :template="template"
            :week-label="weekLabel"
          />
          <AgendaAllDayRow
            v-if="showAllDayRow"
            :columns="columns"
            :template="template"
            :scroller="scrollerEl"
          />
        </div>
        <div
          ref="bodyEl"
          class="relative grid select-none"
          :style="{
            gridTemplateColumns: template,
            gridTemplateRows: '100%',
            height: `${metrics.bodyHeight}px`,
          }"
          role="row"
          data-agenda-grid-body
          @pointerdown="onPointerDown"
          @click="onClick($event, false)"
          @dblclick="onClick($event, true)"
        >
          <div
            class="sticky start-0 z-20 border-e border-(--ui-border) bg-(--ui-bg)"
            :style="{
              gridColumn: 1,
              gridRow: 1,
              width: `${GRID_GUTTER_WIDTH}px`,
            }"
            role="rowheader"
          >
            <span
              v-for="hour in hours"
              :key="hour.key"
              class="text-dimmed absolute end-1.5 text-[10px] tabular-nums"
              :class="hour.top > 0 && '-translate-y-1/2'"
              :style="{ top: `${hour.top}px` }"
            >
              {{ hour.label }}
            </span>
            <span
              v-for="slot in slotLines"
              :key="`slot-${slot.key}`"
              class="text-primary absolute start-1 text-[10px] font-semibold"
              :style="{ top: `${slot.top + 2}px` }"
            >
              {{ processText(slot.label) }}
            </span>
          </div>
          <div
            class="pointer-events-none absolute inset-y-0 end-0 z-[1]"
            :style="{
              ...linesStyle,
              insetInlineStart: `${GRID_GUTTER_WIDTH}px`,
            }"
            aria-hidden="true"
          />
          <div
            v-for="slot in slotLines"
            :key="`line-${slot.key}`"
            class="pointer-events-none absolute end-0 z-[1] border-t border-(--ui-primary)/50"
            :style="{
              top: `${slot.top}px`,
              insetInlineStart: `${GRID_GUTTER_WIDTH}px`,
            }"
            aria-hidden="true"
          />
          <AgendaGridColumn
            v-for="(layout, index) in columnLayouts"
            :key="layout.column.key"
            :layout="layout"
            :metrics="metrics"
            :is-first-of-day="isFirstOfDay(index)"
            :style="{ gridColumn: index + 2, gridRow: 1 }"
          />
          <AgendaGridPreview
            :columns="columns"
            :metrics="metrics"
            :template="template"
          />
        </div>
      </div>
    </div>
  </div>
</template>
