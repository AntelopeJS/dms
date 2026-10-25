<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type {
  AgendaDropTarget,
  AgendaOccurrence,
} from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  layoutAllDayRow,
  type AgendaGridColumn,
} from "../../composables/agenda/agendaTimeGridLayout";
import {
  GRID_GUTTER_WIDTH,
  gridColumnAt,
  placementSpan,
} from "../../composables/agenda/agendaTimeGridParts";
import {
  backgroundAppliesTo,
  backgroundSpans,
} from "../../composables/agenda/agendaBackgroundSpans";
import { isDayKey } from "../../composables/agenda/agendaTime";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import AgendaEventChip from "./AgendaEventChip.vue";
import AgendaGhost from "./AgendaGhost.vue";
import AgendaDayBarsPreview from "./AgendaDayBarsPreview.vue";

/**
 * The all-day row above a time grid: all-day events and timed ones of a day
 * or more as bars in lanes over the columns, their staged ghosts, the
 * all-day backgrounds (a public holiday's tint and name). A drop here makes
 * an event all-day; a click or a drag on an empty day creates one.
 */
interface AgendaAllDayRowProps {
  columns: AgendaGridColumn[];
  template: string;
  /** The scrolling area holding the grid (its sticky gutter hides the first columns). */
  scroller: HTMLElement | null;
}

const props = defineProps<AgendaAllDayRowProps>();

const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

const GHOST_SUFFIX = "#ghost";
/** Lanes shown before the row scrolls. */
const VISIBLE_LANES = 4;
const LANE_PX = 24;

const timeZone = computed(() => ctx.options.value.timeZone);

const ghosts = computed<AgendaOccurrence[]>(() =>
  ctx.occurrences.value
    .filter((occurrence) => occurrence.ghost && occurrence.state === "staged")
    .map((occurrence) => ({
      ...occurrence,
      ...placementSpan(occurrence.ghost!, timeZone.value),
      key: `${occurrence.key}${GHOST_SUFFIX}`,
    })),
);
const layout = computed(() =>
  layoutAllDayRow([...ctx.occurrences.value, ...ghosts.value], props.columns),
);
const lanes = computed(() => Math.max(1, layout.value.lanes));
const isGhost = (occurrence: AgendaOccurrence) =>
  occurrence.key.endsWith(GHOST_SUFFIX);

const tints = computed(() => {
  // Only backgrounds of whole days show here (a holiday); timed ones shade the body.
  const spans = backgroundSpans(ctx.backgrounds.value, timeZone.value).filter(
    (span) => span.background.allDay || isDayKey(span.background.start),
  );
  return props.columns.flatMap((column, index) => {
    const span = spans.find(
      (candidate) =>
        candidate.startDay <= column.day.key &&
        candidate.endDay >= column.day.key &&
        backgroundAppliesTo(candidate, column.resource?.id ?? null),
    );
    return span
      ? [{ index, style: span.style, label: span.background.label }]
      : [];
  });
});

const previewColumns = computed(() =>
  props.columns.map((column) => ({
    day: column.day.key,
    resourceId: column.resource?.id,
  })),
);

const rowEl = ref<HTMLElement | null>(null);

function targetAt(x: number): AgendaDropTarget | null {
  const row = rowEl.value;
  if (!row) return null;
  if (
    props.scroller &&
    x < props.scroller.getBoundingClientRect().left + GRID_GUTTER_WIDTH
  )
    return null;
  const rect = row.getBoundingClientRect();
  const column =
    props.columns[gridColumnAt(props.columns, x - rect.left, rect.width)];
  if (!column || column.folded) return null;
  return {
    day: column.day.key,
    resourceId: column.resource?.id,
    allDay: true,
    asAllDay: true,
  };
}

let unregister: (() => void) | undefined;
onMounted(() => {
  if (!rowEl.value) return;
  unregister = ctx.drag.registerSurface({
    el: rowEl.value,
    resolve: (x) => targetAt(x),
    scroller: props.scroller ?? undefined,
  });
});
onBeforeUnmount(() => unregister?.());

function onPointerDown(pointer: PointerEvent): void {
  const target = targetAt(pointer.clientX);
  if (target) ctx.drag.startEmpty(pointer, target);
}

function onClick(click: MouseEvent, isDouble: boolean): void {
  const target = targetAt(click.clientX);
  if (target) ctx.clickEmpty(target, isDouble);
}
</script>

<template>
  <div
    ref="rowEl"
    class="relative grid border-b border-(--ui-border)"
    :class="lanes > VISIBLE_LANES && 'overflow-y-auto'"
    :style="{
      gridTemplateColumns: props.template,
      gridTemplateRows: `repeat(${lanes}, ${LANE_PX}px)`,
      maxHeight: `${VISIBLE_LANES * LANE_PX + 8}px`,
    }"
    role="row"
    data-agenda-all-day
    @pointerdown="onPointerDown"
    @click="onClick($event, false)"
    @dblclick="onClick($event, true)"
  >
    <div
      class="text-dimmed sticky start-0 z-20 flex items-center justify-end border-e border-(--ui-border) bg-(--ui-bg) pe-2 text-[10px] font-medium uppercase"
      :style="{
        gridColumn: 1,
        gridRow: `1 / span ${lanes}`,
        width: `${GRID_GUTTER_WIDTH}px`,
      }"
      role="rowheader"
    >
      {{ t("dms.agenda.grid.all_day") }}
    </div>
    <div
      v-for="(column, index) in props.columns"
      :key="column.key"
      class="border-e border-(--ui-border)"
      :style="{ gridColumn: index + 2, gridRow: `1 / span ${lanes}` }"
      role="gridcell"
      :aria-label="`${t('dms.agenda.grid.all_day')}, ${ctx.format.day(column.day.key, 'long')}`"
    />
    <div
      v-for="tint in tints"
      :key="`tint-${tint.index}`"
      class="pointer-events-none overflow-hidden"
      :style="{
        ...tint.style,
        gridColumn: tint.index + 2,
        gridRow: `1 / span ${lanes}`,
      }"
    >
      <span
        v-if="tint.label"
        class="text-muted block truncate px-1 pt-0.5 text-[10px]"
      >
        {{ processText(tint.label) }}
      </span>
    </div>
    <div
      v-for="bar in layout.bars"
      :key="`${bar.occurrence.key}:${bar.first}`"
      class="relative z-10 min-w-0 px-0.5 py-0.5"
      :class="isGhost(bar.occurrence) && 'pointer-events-none'"
      :style="{
        gridColumn: `${bar.first + 2} / span ${bar.last - bar.first + 1}`,
        gridRow: bar.lane + 1,
      }"
    >
      <AgendaGhost
        v-if="isGhost(bar.occurrence)"
        :occurrence="bar.occurrence"
        class="size-full"
      />
      <AgendaEventChip
        v-else
        :occurrence="bar.occurrence"
        layout="bar"
        :continues-before="bar.continuesBefore"
        :continues-after="bar.continuesAfter"
      />
    </div>
    <AgendaDayBarsPreview
      :columns="previewColumns"
      :first-grid-column="2"
      :grid-row="1"
    />
  </div>
</template>
