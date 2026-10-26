<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { AGENDA_UPCOMING_COUNT } from "../../composables/agenda/agendaShell";
import type { AgendaOccurrence } from "../../composables/agenda/agendaModel";

/**
 * The next events from now, from the data in hand (series expanded ahead),
 * soonest first; a click opens one. A route answering only the range shown
 * gives only that range's events.
 */
const ctx = useAgendaContext();
const { t } = useI18n();

const items = computed(() =>
  ctx.upcoming.value.slice(0, AGENDA_UPCOMING_COUNT),
);
const whenOf = (occurrence: AgendaOccurrence) => {
  const day = ctx.format.day(occurrence.startDay, "medium");
  if (occurrence.allDay) return day;
  const range = ctx.format.timeRange(occurrence.start, occurrence.end);
  return `${day} · ${range}`;
};
</script>

<template>
  <section
    :aria-label="t('dms.agenda.sidebar.upcoming')"
    class="flex flex-col gap-2"
    data-agenda-upcoming
  >
    <h3 class="text-muted text-xs font-semibold tracking-wide uppercase">
      {{ t("dms.agenda.sidebar.upcoming") }}
    </h3>
    <ul v-if="items.length" class="flex flex-col gap-1">
      <li v-for="occurrence in items" :key="occurrence.key">
        <button
          type="button"
          class="hover:bg-elevated focus-visible:ring-primary flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-start focus-visible:ring-2 focus-visible:outline-none"
          :disabled="occurrence.details === false"
          @click="ctx.open(occurrence)"
        >
          <span
            class="mt-1 size-2 shrink-0 rounded-full"
            :style="{ backgroundColor: occurrence.paint.bar }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">
            <span class="text-highlighted block truncate text-sm font-medium">
              {{ occurrence.event.title }}
            </span>
            <span class="text-muted block truncate text-xs">
              {{ whenOf(occurrence) }}
            </span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="text-dimmed text-xs">
      {{ t("dms.agenda.sidebar.upcoming_empty") }}
    </p>
  </section>
</template>
