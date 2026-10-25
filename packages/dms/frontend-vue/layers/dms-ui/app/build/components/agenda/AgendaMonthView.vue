<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { AgendaDropTarget } from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { monthWeeks } from "../../composables/agenda/agendaMonthLayout";
import { backgroundSpans } from "../../composables/agenda/agendaBackgroundSpans";
import { isDayKey } from "../../composables/agenda/agendaTime";
import AgendaMonthWeek from "./AgendaMonthWeek.vue";

/**
 * The `month` view: whole weeks (hidden days left out), week numbers on
 * request, multi-day events as bars on lanes, `maxEventsPerDay` chips a day
 * and "+N more" past it. A day number opens the day; a click, a double
 * click or a drag on an empty day creates, as `create.trigger` says. Rows
 * share the height and scroll when the lanes need more.
 */
const ctx = useAgendaContext();
const { t } = useI18n();

const WEEK_NUMBER_WIDTH = "2.25rem";
/** Pixels a row needs: the day number and the lanes. */
const NUMBER_PX = 28;
const LANE_PX = 22;
const ROW_PADDING_PX = 6;

const weeks = computed(() =>
  monthWeeks(ctx.range.value.days, ctx.options.value.weekStartsOn),
);
const showWeekNumber = computed(
  () => ctx.options.value.raw.weekNumbers === true,
);
const dayCount = computed(() => weeks.value[0]?.days.length ?? 7);
const template = computed(() =>
  [
    showWeekNumber.value ? WEEK_NUMBER_WIDTH : "",
    `repeat(${dayCount.value}, minmax(0, 1fr))`,
  ]
    .filter(Boolean)
    .join(" "),
);
const rowMin = computed(
  () =>
    NUMBER_PX +
    Math.max(1, ctx.options.value.maxEventsPerDay) * LANE_PX +
    ROW_PADDING_PX,
);
const backgrounds = computed(() =>
  backgroundSpans(ctx.backgrounds.value, ctx.options.value.timeZone).filter(
    (span) => span.background.allDay || isDayKey(span.background.start),
  ),
);

const bodyEl = ref<HTMLElement | null>(null);

/** The day under a point: the week row under it, then its column. */
function targetAt(x: number, y: number): AgendaDropTarget | null {
  const rows = bodyEl.value
    ? [...bodyEl.value.querySelectorAll<HTMLElement>("[data-agenda-week]")]
    : [];
  const index = rows.findIndex((row) => {
    const rect = row.getBoundingClientRect();
    return y >= rect.top && y < rect.bottom;
  });
  const week = weeks.value[index];
  if (!week) return null;
  const row = rows[index]!;
  const rect = row.getBoundingClientRect();
  // The week number button is the row's first cell.
  const numberWidth = showWeekNumber.value
    ? (row.firstElementChild?.getBoundingClientRect().width ?? 0)
    : 0;
  const width = (rect.width - numberWidth) / week.days.length;
  const column = Math.min(
    week.days.length - 1,
    Math.max(0, Math.floor((x - rect.left - numberWidth) / width)),
  );
  return { day: week.days[column]!.key };
}

let unregister: (() => void) | undefined;
onMounted(() => {
  if (!bodyEl.value) return;
  unregister = ctx.drag.registerSurface({
    el: bodyEl.value,
    resolve: targetAt,
    scroller: bodyEl.value,
  });
});
onBeforeUnmount(() => unregister?.());
</script>

<template>
  <div
    class="flex min-h-0 flex-1 flex-col"
    role="grid"
    :aria-label="ctx.format.title.value"
    data-agenda-month
  >
    <div
      class="grid border-b border-(--ui-border)"
      :style="{ gridTemplateColumns: template }"
      role="row"
    >
      <div
        v-if="showWeekNumber"
        role="columnheader"
        :aria-label="t('dms.agenda.month.week_number')"
      />
      <div
        v-for="day in weeks[0]?.days ?? []"
        :key="day.weekday"
        class="text-muted truncate px-2 py-1.5 text-center text-xs font-medium"
        role="columnheader"
      >
        {{ ctx.format.day(day.key, "weekdayShort") }}
      </div>
    </div>
    <div
      ref="bodyEl"
      class="grid min-h-0 flex-1 overflow-y-auto overscroll-contain select-none"
      :style="{
        gridTemplateRows: `repeat(${weeks.length}, minmax(${rowMin}px, 1fr))`,
      }"
    >
      <AgendaMonthWeek
        v-for="week in weeks"
        :key="week.key"
        :week="week"
        :template="template"
        :occurrences="ctx.occurrences.value"
        :backgrounds="backgrounds"
        :show-week-number="showWeekNumber"
      />
    </div>
  </div>
</template>
