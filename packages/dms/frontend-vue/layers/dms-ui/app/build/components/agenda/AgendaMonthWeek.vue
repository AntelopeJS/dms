<script setup lang="ts">
import { computed } from "vue";
import type {
  AgendaDay,
  AgendaOccurrence,
} from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  layoutMonthWeek,
  type AgendaWeekRow,
} from "../../composables/agenda/agendaMonthLayout";
import {
  backgroundAppliesTo,
  type AgendaBackgroundSpan,
} from "../../composables/agenda/agendaBackgroundSpans";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import AgendaEventChip from "./AgendaEventChip.vue";
import AgendaMorePopover from "./AgendaMorePopover.vue";
import AgendaDayBarsPreview from "./AgendaDayBarsPreview.vue";

/**
 * A week of the month view: its day cells (number leading to the day view,
 * days of other months dimmed, today marked, holidays tinted and named),
 * its events on lanes (bars over days, a dot and a time for the others),
 * "+N more" on a crowded day, and the drag preview over its days.
 */
interface AgendaMonthWeekProps {
  week: AgendaWeekRow;
  template: string;
  occurrences: AgendaOccurrence[];
  backgrounds: AgendaBackgroundSpan[];
  showWeekNumber: boolean;
}

const props = defineProps<AgendaMonthWeekProps>();

const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

/** Pixels of the day number line and of a lane. */
const NUMBER_ROW = "1.75rem";
const LANE_PX = 22;

const limit = computed(() => Math.max(1, ctx.options.value.maxEventsPerDay));
const layout = computed(() =>
  layoutMonthWeek(props.week.days, props.occurrences, limit.value),
);
const offset = computed(() => (props.showWeekNumber ? 2 : 1));
const previewColumns = computed(() =>
  props.week.days.map((day) => ({ day: day.key })),
);

const tintOf = (day: AgendaDay) =>
  props.backgrounds.find(
    (span) =>
      span.startDay <= day.key &&
      span.endDay >= day.key &&
      backgroundAppliesTo(span, null),
  );

const dayLabel = (day: AgendaDay, index: number) =>
  t("dms.agenda.month.day_label", {
    day: ctx.format.day(day.key, "long"),
    count: layout.value.dayEvents[index]?.length ?? 0,
  });

function openDay(day: AgendaDay): void {
  ctx.goTo(day.key, "day");
}

function onPointerDown(pointer: PointerEvent, day: AgendaDay): void {
  ctx.drag.startEmpty(pointer, { day: day.key });
}

function onClick(day: AgendaDay, isDouble: boolean): void {
  ctx.clickEmpty({ day: day.key, allDay: true }, isDouble);
}
</script>

<template>
  <div
    class="grid min-h-0 border-b border-(--ui-border)"
    :style="{
      gridTemplateColumns: props.template,
      gridTemplateRows: `${NUMBER_ROW} repeat(${limit}, ${LANE_PX}px) minmax(0, 1fr)`,
    }"
    role="row"
    data-agenda-week
  >
    <button
      v-if="props.showWeekNumber"
      type="button"
      class="text-dimmed hover:text-primary flex justify-center border-e border-(--ui-border) pt-1.5 text-[10px] font-medium tabular-nums"
      :style="{ gridColumn: 1, gridRow: '1 / -1' }"
      :aria-label="t('dms.agenda.month.open_week', { week: props.week.week })"
      @click="ctx.goTo(props.week.days[0]!.key, 'week')"
    >
      {{ t("dms.agenda.grid.week_short", { week: props.week.week }) }}
    </button>
    <div
      v-for="(day, index) in props.week.days"
      :key="day.key"
      class="min-w-0 border-e border-(--ui-border)"
      :class="!day.inMonth && 'bg-(--ui-bg-muted)/60'"
      :style="{
        ...(tintOf(day)?.style ?? {}),
        gridColumn: index + offset,
        gridRow: '1 / -1',
      }"
      role="gridcell"
      :aria-label="dayLabel(day, index)"
      :data-agenda-day="day.key"
      @pointerdown="onPointerDown($event, day)"
      @click="onClick(day, false)"
      @dblclick="onClick(day, true)"
    >
      <div class="flex h-7 items-center justify-between gap-1 px-1.5">
        <span
          v-if="tintOf(day)?.background.label"
          class="text-muted min-w-0 truncate text-[10px]"
        >
          {{ processText(tintOf(day)!.background.label!) }}
        </span>
        <button
          type="button"
          class="ms-auto flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
          :class="[
            day.isToday
              ? 'bg-primary text-inverted'
              : day.inMonth
                ? 'text-highlighted hover:bg-elevated'
                : 'text-dimmed hover:bg-elevated',
          ]"
          :aria-label="ctx.format.day(day.key, 'long')"
          @pointerdown.stop
          @click.stop="openDay(day)"
          @dblclick.stop
        >
          {{ day.dayOfMonth }}
        </button>
      </div>
    </div>
    <div
      v-for="segment in layout.segments"
      :key="`${segment.occurrence.key}:${segment.first}`"
      class="relative z-10 min-w-0 px-0.5 py-px"
      :style="{
        gridColumn: `${segment.first + offset} / span ${segment.last - segment.first + 1}`,
        gridRow: segment.lane + 2,
      }"
    >
      <AgendaEventChip
        :occurrence="segment.occurrence"
        :layout="segment.layout"
        :continues-before="segment.continuesBefore"
        :continues-after="segment.continuesAfter"
      />
    </div>
    <template v-for="(count, index) in layout.more" :key="`more-${index}`">
      <div
        v-if="count > 0"
        class="relative z-10 min-w-0 px-0.5"
        :style="{ gridColumn: index + offset, gridRow: limit + 1 }"
      >
        <AgendaMorePopover
          :day="props.week.days[index]!"
          :occurrences="layout.dayEvents[index]!"
          :count="count"
        />
      </div>
    </template>
    <AgendaDayBarsPreview
      :columns="previewColumns"
      :first-grid-column="offset"
      :grid-row="2"
      include-timed
    />
  </div>
</template>
