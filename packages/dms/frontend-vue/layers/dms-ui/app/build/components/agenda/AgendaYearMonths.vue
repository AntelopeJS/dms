<script setup lang="ts">
import { computed } from "vue";
import type { YearDayCell } from "../../composables/agenda/agendaYearLayout";
import type { AgendaYearState } from "../../composables/agenda/useAgendaYear";
import { addDays } from "../../composables/agenda/agendaTime";

/**
 * The year as twelve small months: weeks from the week start, a dot per
 * event of a day (three at most), holidays tinted, weekends dimmed, today
 * outlined. A click on an empty day reaches `clickEmpty` (create, a
 * `twoClicks` range); on a busy day it opens its event, or shows the day.
 */
const props = defineProps<{
  state: AgendaYearState;
  locale: string;
  weekStartsOn: number;
  weekNumbers: boolean;
  monthLabel: (year: number, month: number) => string;
}>();

const { t } = useI18n();

const MAX_DOTS = 3;
const DAYS_PER_WEEK = 7;
/** A Sunday, to name the weekdays from. */
const REFERENCE_SUNDAY = "2026-01-04";

const weekdays = computed(() => {
  const format = new Intl.DateTimeFormat(props.locale, {
    weekday: "narrow",
    timeZone: "UTC",
  });
  return Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
    const day = addDays(
      REFERENCE_SUNDAY,
      (props.weekStartsOn + index) % DAYS_PER_WEEK,
    );
    return { key: day, label: format.format(new Date(`${day}T12:00:00Z`)) };
  });
});

const columns = computed(() =>
  props.weekNumbers
    ? "grid-cols-[1.5rem_repeat(7,minmax(0,1fr))]"
    : "grid-cols-7",
);

const dots = (cell: YearDayCell) => cell.occurrences.slice(0, MAX_DOTS);

function dayClass(cell: YearDayCell): string[] {
  const preview = props.state.previewRange.value;
  const inPreview =
    !!cell.day &&
    !!preview &&
    cell.day >= preview.from &&
    cell.day <= preview.to;
  return [
    cell.weekend ? "text-muted" : "text-default",
    cell.isToday
      ? "outline-2 -outline-offset-2 outline-primary font-semibold text-primary"
      : "",
    props.state.inPending(cell.day)
      ? "bg-primary/15 ring-1 ring-inset ring-primary"
      : "",
    inPreview && preview?.valid ? "ring-2 ring-inset ring-primary/70" : "",
    inPreview && !preview?.valid ? "ring-2 ring-inset ring-error" : "",
  ];
}
</script>

<template>
  <div class="@container">
    <div
      class="grid grid-cols-1 gap-4 p-3 @sm:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4"
    >
      <section
        v-for="month in state.months.value"
        :key="month.key"
        class="min-w-0"
        :aria-label="monthLabel(month.year, month.month)"
      >
        <h3 class="text-highlighted mb-1 px-1 text-sm font-semibold capitalize">
          {{ monthLabel(month.year, month.month) }}
        </h3>
        <div
          class="text-dimmed grid text-center text-[11px]"
          :class="columns"
          aria-hidden="true"
        >
          <span v-if="weekNumbers" />
          <span v-for="weekday in weekdays" :key="weekday.key">
            {{ weekday.label }}
          </span>
        </div>
        <div role="grid">
          <div
            v-for="week in month.weeks"
            :key="week.key"
            role="row"
            class="grid"
            :class="columns"
          >
            <span
              v-if="weekNumbers"
              class="text-dimmed flex items-center justify-center text-[10px] tabular-nums"
              :title="t('dms.agenda.year.week', { week: week.week })"
            >
              {{ week.week }}
            </span>
            <template v-for="cell in week.days" :key="cell.key">
              <span v-if="!cell.day" role="gridcell" class="h-8" />
              <button
                v-else
                type="button"
                role="gridcell"
                class="hover:bg-elevated focus-visible:outline-primary relative flex h-8 min-w-0 flex-col items-center justify-start rounded-md pt-1 text-xs tabular-nums focus-visible:outline-2"
                :class="dayClass(cell)"
                :style="cell.backgrounds[0]?.style"
                :title="state.titleOf(cell)"
                :aria-label="state.titleOf(cell)"
                :data-agenda-day="cell.day"
                @pointerdown="state.pressDay($event, cell)"
                @pointerenter="state.hover(cell.day)"
                @click="state.clickDay(cell, false, false)"
                @dblclick="state.clickDay(cell, true, false)"
              >
                <span class="leading-4">{{ cell.dayOfMonth }}</span>
                <span
                  v-if="cell.occurrences.length"
                  class="mt-0.5 flex gap-0.5"
                  aria-hidden="true"
                >
                  <span
                    v-for="occurrence in dots(cell)"
                    :key="occurrence.key"
                    class="size-1 rounded-full"
                    :style="{ backgroundColor: occurrence.paint.bar }"
                  />
                </span>
              </button>
            </template>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
