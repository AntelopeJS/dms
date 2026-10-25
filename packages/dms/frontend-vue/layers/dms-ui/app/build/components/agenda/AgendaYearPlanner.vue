<script setup lang="ts">
import { computed } from "vue";
import type { AgendaOccurrence } from "../../composables/agenda/agendaModel";
import {
  PLANNER_DAYS,
  type YearDayCell,
  type YearPlannerMonth,
} from "../../composables/agenda/agendaYearLayout";
import type { AgendaYearState } from "../../composables/agenda/useAgendaYear";

/**
 * The year as a planner: a row per month, a cell per day (1 to 31), the
 * days a month does not have hatched, weekends shaded, today outlined. A day
 * covered by an all-day event takes its colour and its `short` label; a
 * public holiday its tint. The pending `twoClicks` range and the drag
 * preview are highlighted.
 */
const props = defineProps<{
  state: AgendaYearState;
  locale: string;
}>();

const HATCH =
  "repeating-linear-gradient(-45deg, var(--ui-border-accented) 0 1px, transparent 1px 6px)";
const DAY_NUMBERS = Array.from(
  { length: PLANNER_DAYS },
  (_, index) => index + 1,
);

const monthFormat = computed(
  () =>
    new Intl.DateTimeFormat(props.locale, { month: "short", timeZone: "UTC" }),
);
const spansYears = computed(() => {
  const months = props.state.planner.value;
  return months[0]?.year !== months.at(-1)?.year;
});

function monthLabel(month: YearPlannerMonth): string {
  const name = monthFormat.value.format(
    new Date(Date.UTC(month.year, month.month, 1)),
  );
  return spansYears.value ? `${name} ${String(month.year).slice(2)}` : name;
}

const eventOf = (cell: YearDayCell): AgendaOccurrence | undefined =>
  cell.occurrences[0];

function cellStyle(cell: YearDayCell): Record<string, string> | undefined {
  if (!cell.day) return { backgroundImage: HATCH };
  const occurrence = eventOf(cell);
  if (occurrence) {
    const tentative =
      occurrence.event.status === "tentative" ||
      occurrence.event.style === "dashed";
    return tentative
      ? {
          backgroundColor: occurrence.paint.background,
          color: occurrence.paint.text,
          borderColor: occurrence.paint.bar,
        }
      : {
          backgroundColor: occurrence.paint.bar,
          color: occurrence.paint.onBar,
        };
  }
  return cell.backgrounds[0]?.style;
}

function cellClass(cell: YearDayCell): string[] {
  const occurrence = eventOf(cell);
  const preview = props.state.previewRange.value;
  const inPreview =
    !!cell.day &&
    !!preview &&
    cell.day >= preview.from &&
    cell.day <= preview.to;
  return [
    cell.weekend && !occurrence ? "bg-elevated" : "",
    occurrence?.event.status === "tentative" ||
    occurrence?.event.style === "dashed"
      ? "border border-dashed"
      : "",
    occurrence?.event.status === "cancelled" || occurrence?.event.muted
      ? "opacity-50"
      : "",
    cell.isToday ? "z-[1] outline-2 -outline-offset-2 outline-primary" : "",
    props.state.inPending(cell.day)
      ? "ring-2 ring-inset ring-primary bg-primary/15"
      : "",
    inPreview && preview?.valid ? "ring-2 ring-inset ring-primary/70" : "",
    inPreview && !preview?.valid ? "ring-2 ring-inset ring-error" : "",
  ];
}

const short = (cell: YearDayCell) => eventOf(cell)?.event.short ?? "";
</script>

<template>
  <div
    class="min-w-[44rem]"
    role="grid"
    :aria-rowcount="state.planner.value.length + 1"
  >
    <div
      class="border-default grid grid-cols-[4rem_repeat(31,minmax(1.4rem,1fr))] border-b"
      role="row"
    >
      <span class="bg-default sticky left-0" role="columnheader" />
      <span
        v-for="day in DAY_NUMBERS"
        :key="day"
        role="columnheader"
        class="text-muted py-1 text-center text-[11px] tabular-nums"
      >
        {{ day }}
      </span>
    </div>
    <div
      v-for="month in state.planner.value"
      :key="month.key"
      class="border-default grid grid-cols-[4rem_repeat(31,minmax(1.4rem,1fr))] border-b"
      role="row"
    >
      <span
        role="rowheader"
        class="border-default bg-default text-highlighted sticky left-0 z-[2] flex items-center border-e px-2 text-xs font-medium capitalize"
      >
        {{ monthLabel(month) }}
      </span>
      <template v-for="cell in month.cells" :key="cell.key">
        <span
          v-if="!cell.day"
          role="gridcell"
          aria-disabled="true"
          class="border-default h-7 border-s"
          :style="cellStyle(cell)"
        />
        <button
          v-else
          type="button"
          role="gridcell"
          class="border-default focus-visible:outline-primary relative flex h-7 min-w-0 items-center justify-center overflow-hidden border-s text-[10px] leading-none font-semibold tabular-nums focus-visible:outline-2 focus-visible:-outline-offset-2"
          :class="cellClass(cell)"
          :style="cellStyle(cell)"
          :title="state.titleOf(cell)"
          :aria-label="state.titleOf(cell)"
          :data-agenda-day="cell.day"
          @pointerdown="state.pressDay($event, cell)"
          @pointerenter="state.hover(cell.day)"
          @click="state.clickDay(cell, false, true)"
          @dblclick="state.clickDay(cell, true, true)"
        >
          <span class="truncate px-px">{{ short(cell) }}</span>
          <span
            v-if="cell.occurrences.length > 1"
            aria-hidden="true"
            class="absolute end-0.5 top-0.5 size-1 rounded-full bg-current"
          />
        </button>
      </template>
    </div>
  </div>
</template>
