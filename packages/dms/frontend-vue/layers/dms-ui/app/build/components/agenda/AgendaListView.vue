<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  buildAgendaList,
  type AgendaListRow,
} from "../../composables/agenda/agendaListLayout";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * A `list`: the days of the range that hold events, under sticky day
 * headers ("Today" on today), each event on a line with its time (or all
 * day), a dot of its calendar's colour, its title, subtitle, place and
 * calendar. Empty days are left out; a range without events says so.
 */
const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

const days = computed(() =>
  buildAgendaList(ctx.range.value.days, ctx.occurrences.value),
);
const content = computed(() => ctx.options.value.raw.eventContent ?? {});
const opensOnDouble = computed(
  () => ctx.options.value.raw.details?.openOn === "doubleClick",
);

const emptyLabel = computed(() => {
  const label = ctx.options.value.raw.emptyLabel;
  return label ? processText(label) : t("dms.agenda.list.empty");
});

function timeOf(row: AgendaListRow): string {
  const { occurrence } = row;
  const parts: Record<AgendaListRow["part"], () => string> = {
    allDay: () => t("dms.agenda.list.all_day"),
    middle: () => t("dms.agenda.list.all_day"),
    single: () => ctx.format.timeRange(occurrence.start, occurrence.end),
    start: () =>
      t("dms.agenda.list.from", { time: ctx.format.time(occurrence.start) }),
    end: () =>
      t("dms.agenda.list.until", { time: ctx.format.time(occurrence.end) }),
  };
  return parts[row.part]();
}

const calendarLabel = (row: AgendaListRow) => {
  const label = row.occurrence.calendar?.label;
  return label ? processText(label) : "";
};

function ariaLabel(row: AgendaListRow, dayKey: string): string {
  return [
    row.occurrence.event.title,
    ctx.format.day(dayKey, "long"),
    timeOf(row),
    calendarLabel(row),
    row.occurrence.event.location ?? "",
  ]
    .filter(Boolean)
    .join(", ");
}

function activate(row: AgendaListRow, double: boolean): void {
  if (row.occurrence.details === false || double !== opensOnDouble.value)
    return;
  ctx.open(row.occurrence);
}

const dayTitle = (key: string, isToday: boolean) =>
  isToday ? t("dms.agenda.list.today") : ctx.format.day(key, "weekday");
</script>

<template>
  <div
    class="relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
    :aria-label="t('dms.agenda.list.label')"
  >
    <p v-if="!days.length" class="text-muted px-4 py-10 text-center text-sm">
      {{ emptyLabel }}
    </p>
    <section
      v-for="entry in days"
      :key="entry.day.key"
      :aria-label="ctx.format.day(entry.day.key, 'long')"
    >
      <h3
        class="border-default bg-elevated sticky top-0 z-10 flex items-baseline gap-2 border-b px-3 py-1.5 text-sm"
      >
        <span
          class="font-semibold capitalize"
          :class="entry.day.isToday ? 'text-primary' : 'text-highlighted'"
        >
          {{ dayTitle(entry.day.key, entry.day.isToday) }}
        </span>
        <span class="text-muted">
          {{ ctx.format.day(entry.day.key, "long") }}
        </span>
      </h3>
      <ul role="list">
        <li
          v-for="row in entry.rows"
          :key="row.key"
          class="border-default border-b last:border-b-0"
        >
          <button
            type="button"
            class="hover:bg-elevated/60 focus-visible:outline-primary @container flex w-full min-w-0 items-start gap-3 px-3 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
            :class="[
              row.occurrence.event.status === 'cancelled'
                ? 'line-through opacity-60'
                : '',
              row.occurrence.event.muted ? 'opacity-60' : '',
            ]"
            :aria-label="ariaLabel(row, entry.day.key)"
            :data-agenda-occurrence="row.occurrence.key"
            @click="activate(row, false)"
            @dblclick="activate(row, true)"
          >
            <span
              v-if="content.time !== false"
              class="text-muted w-24 shrink-0 pt-0.5 text-xs tabular-nums sm:w-32"
            >
              {{ timeOf(row) }}
            </span>
            <span
              aria-hidden="true"
              class="mt-1.5 size-2.5 shrink-0 rounded-full"
              :class="
                row.occurrence.event.status === 'tentative'
                  ? 'border-2 bg-transparent'
                  : ''
              "
              :style="
                row.occurrence.event.status === 'tentative'
                  ? { borderColor: row.occurrence.paint.bar }
                  : { backgroundColor: row.occurrence.paint.bar }
              "
            />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex min-w-0 items-center gap-1.5">
                <UIcon
                  v-if="row.occurrence.event.icon && content.icon !== false"
                  :name="row.occurrence.event.icon"
                  class="text-muted size-3.5 shrink-0"
                />
                <span class="text-highlighted truncate text-sm font-medium">
                  {{ row.occurrence.event.title }}
                </span>
                <UIcon
                  v-if="row.occurrence.event.issues?.length"
                  name="i-ph-warning"
                  class="text-warning size-3.5 shrink-0"
                />
              </span>
              <span
                v-if="
                  row.occurrence.event.subtitle && content.subtitle !== false
                "
                class="text-muted truncate text-xs"
              >
                {{ row.occurrence.event.subtitle }}
              </span>
              <span
                v-if="
                  row.occurrence.event.location && content.location !== false
                "
                class="text-muted flex min-w-0 items-center gap-1 text-xs"
              >
                <UIcon name="i-ph-map-pin" class="size-3 shrink-0" />
                <span class="truncate">
                  {{ row.occurrence.event.location }}
                </span>
              </span>
            </span>
            <span
              v-if="calendarLabel(row)"
              class="text-dimmed hidden shrink-0 pt-0.5 text-xs @md:inline"
            >
              {{ calendarLabel(row) }}
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
