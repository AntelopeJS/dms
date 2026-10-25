<script setup lang="ts">
import { parseDate } from "@internationalized/date";
import { computed } from "vue";
import DmsCalendar from "../../../components/form/components/Calendar.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { addDays } from "../../composables/agenda/agendaTime";

/**
 * The month around the shown day: a click moves the agenda to that day, the
 * days shown are tinted and the days with events carry a dot.
 */
const ctx = useAgendaContext();
// The calendar takes a date value; it answers ISO days.
const anchorDate = computed(() => parseDate(ctx.anchor.value));
const { t } = useI18n();

const MAX_MARKED_SPAN = 62;

/** Every day an occurrence of the range covers. */
const busyDays = computed(() => {
  const days = new Set<string>();
  for (const occurrence of ctx.occurrences.value) {
    let day = occurrence.startDay;
    for (
      let step = 0;
      day <= occurrence.endDay && step < MAX_MARKED_SPAN;
      step++
    ) {
      days.add(day);
      day = addDays(day, 1);
    }
  }
  return days;
});

/** A day of the calendar's grid, as UCalendar hands it to its `day` slot. */
interface CalendarDay {
  toString: () => string;
  day: number;
}

const keyOf = (day: CalendarDay) => day.toString();
const isInRange = (day: CalendarDay) => {
  const key = keyOf(day);
  return key >= ctx.range.value.from && key <= ctx.range.value.to;
};
const pick = (day: unknown) => {
  if (typeof day === "string") ctx.goTo(day);
};
</script>

<template>
  <section
    :aria-label="t('dms.agenda.sidebar.mini_calendar')"
    data-agenda-mini-calendar
  >
    <DmsCalendar
      size="sm"
      :model-value="anchorDate"
      :week-starts-on="ctx.options.value.weekStartsOn"
      :week-numbers="Boolean(ctx.options.value.raw.weekNumbers)"
      :min-date="ctx.options.value.raw.minDate"
      :max-date="ctx.options.value.raw.maxDate"
      :fixed-weeks="true"
      @update:model-value="pick"
    >
      <template #day="{ day }">
        <span
          :class="[
            'relative grid size-full place-items-center rounded-md',
            isInRange(day as CalendarDay) && 'bg-(--ui-primary)/10',
          ]"
        >
          {{ (day as CalendarDay).day }}
          <span
            v-if="busyDays.has(keyOf(day as CalendarDay))"
            class="bg-primary absolute bottom-0.5 size-1 rounded-full"
            aria-hidden="true"
          />
        </span>
      </template>
    </DmsCalendar>
  </section>
</template>
