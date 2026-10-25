<script setup lang="ts">
import { computed } from "vue";
import type { AgendaDay } from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import type {
  AgendaMonthSegment,
  AgendaMonthWeekLayout,
  AgendaWeekRow,
} from "../../composables/agenda/agendaMonthLayout";
import type { AgendaBackgroundSpan } from "../../composables/agenda/agendaBackgroundSpans";
import { dayBackground } from "../../composables/agenda/agendaTimeGridParts";
import { rovingToken } from "../../composables/agenda/agendaMonthLayout";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import AgendaEventChip from "./AgendaEventChip.vue";
import AgendaMorePopover from "./AgendaMorePopover.vue";
import AgendaDayBarsPreview from "./AgendaDayBarsPreview.vue";

/**
 * A week of the month view: its day cells (number leading to the day view,
 * days of other months dimmed, today marked, holidays tinted and named),
 * its events on lanes (bars over days, a dot and a time for the others),
 * "+N more" on a crowded day, and the drag preview over its days. Each
 * chip sits in the grid cell of its first day; one chip of the month is in
 * the tab order (`entry`): the day numbers, the chips and the "+N more"
 * of the month are one roving set, the arrows move through it.
 */
interface AgendaMonthWeekProps {
  week: AgendaWeekRow;
  layout: AgendaMonthWeekLayout;
  template: string;
  backgrounds: AgendaBackgroundSpan[];
  showWeekNumber: boolean;
  /** The one element of the month in the tab order (see {@link rovingToken}). */
  entry: string;
  /** Pixels of a lane. */
  lanePx: number;
}

const props = defineProps<AgendaMonthWeekProps>();

const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

/** The day number line, as `density` wants it. */
const NUMBER_ROWS = { compact: "1.5rem", comfortable: "1.75rem" } as const;

const limit = computed(() => Math.max(1, ctx.options.value.maxEventsPerDay));
const offset = computed(() => (props.showWeekNumber ? 2 : 1));
const numberRow = computed(() =>
  ctx.options.value.raw.density === "compact"
    ? NUMBER_ROWS.compact
    : NUMBER_ROWS.comfortable,
);
const previewColumns = computed(() =>
  props.week.days.map((day) => ({ day: day.key })),
);

/** Every background of each day, layered, with all their names. */
const tints = computed(() =>
  props.week.days.map((day) => {
    const found = dayBackground(props.backgrounds, day.key, null);
    if (!found) return null;
    const label = found.labels.map((text) => processText(text)).join(" · ");
    return { style: found.style, label };
  }),
);

/** The chips starting on each day: they belong to its cell. */
const segmentsOf = computed(() =>
  props.week.days.map((_, index) =>
    props.layout.segments.filter((segment) => segment.first === index),
  ),
);

const dayLabel = (day: AgendaDay, index: number) =>
  t("dms.agenda.month.day_label", {
    day: ctx.format.day(day.key, "long"),
    count: props.layout.dayEvents[index]?.length ?? 0,
  });

const segmentStyle = (segment: AgendaMonthSegment) => ({
  gridColumn: `${segment.first + offset.value} / span ${segment.last - segment.first + 1}`,
  gridRow: segment.lane + 2,
});

const tabIndexOf = (token: string) => (props.entry === token ? 0 : -1);

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
      gridTemplateRows: `${numberRow} repeat(${limit}, ${props.lanePx}px) minmax(0, 1fr)`,
    }"
    role="row"
    data-agenda-week
  >
    <div v-if="props.showWeekNumber" class="contents" role="rowheader">
      <button
        type="button"
        tabindex="-1"
        class="text-dimmed hover:text-primary flex justify-center border-e border-(--ui-border) pt-1.5 text-[10px] font-medium tabular-nums"
        :style="{ gridColumn: 1, gridRow: '1 / -1' }"
        :aria-label="t('dms.agenda.month.open_week', { week: props.week.week })"
        @click="ctx.goTo(props.week.days[0]!.key, 'week')"
      >
        {{ t("dms.agenda.grid.week_short", { week: props.week.week }) }}
      </button>
    </div>
    <div
      v-for="(day, index) in props.week.days"
      :key="day.key"
      class="contents"
      role="gridcell"
      :aria-label="dayLabel(day, index)"
    >
      <div
        class="min-w-0 border-e border-(--ui-border)"
        :class="!day.inMonth && 'bg-(--ui-bg-muted)/60'"
        :style="{
          ...(tints[index]?.style ?? {}),
          gridColumn: index + offset,
          gridRow: '1 / -1',
        }"
        :data-agenda-day="day.key"
        @pointerdown="onPointerDown($event, day)"
        @click="onClick(day, false)"
        @dblclick="onClick(day, true)"
      >
        <div
          class="flex items-center justify-between gap-1 px-1.5"
          :style="{ height: numberRow }"
        >
          <span
            v-if="tints[index]?.label"
            class="text-muted min-w-0 truncate text-[10px]"
          >
            {{ tints[index]!.label }}
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
            :tabindex="tabIndexOf(rovingToken.day(day.key))"
            :data-agenda-roving="rovingToken.day(day.key)"
            @click.stop="openDay(day)"
            @dblclick.stop
          >
            {{ day.dayOfMonth }}
          </button>
        </div>
      </div>
      <div
        v-for="segment in segmentsOf[index]"
        :key="`${segment.occurrence.key}:${segment.first}`"
        class="relative z-10 min-w-0 px-0.5 py-px"
        :style="segmentStyle(segment)"
      >
        <AgendaEventChip
          :occurrence="segment.occurrence"
          :layout="segment.layout"
          :continues-before="segment.continuesBefore"
          :continues-after="segment.continuesAfter"
          :tabbable="props.entry === rovingToken.chip(props.week.key, segment)"
          :data-agenda-roving="rovingToken.chip(props.week.key, segment)"
        />
      </div>
      <div
        v-if="(props.layout.more[index] ?? 0) > 0"
        class="relative z-10 min-w-0 px-0.5"
        :style="{ gridColumn: index + offset, gridRow: limit + 1 }"
      >
        <AgendaMorePopover
          :tabbable="props.entry === rovingToken.more(day.key)"
          :roving="rovingToken.more(day.key)"
          :day="day"
          :occurrences="props.layout.dayEvents[index]!"
          :count="props.layout.more[index]!"
        />
      </div>
    </div>
    <div class="contents" aria-hidden="true">
      <AgendaDayBarsPreview
        :columns="previewColumns"
        :first-grid-column="offset"
        :grid-row="2"
        include-timed
      />
    </div>
  </div>
</template>
