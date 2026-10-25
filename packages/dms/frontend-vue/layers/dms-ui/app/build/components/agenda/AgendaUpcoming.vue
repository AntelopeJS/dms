<script setup lang="ts">
import { computed } from "vue";
import { useNow } from "@vueuse/core";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { upcomingOccurrences } from "../../composables/agenda/agendaShell";
import type { AgendaOccurrence } from "../../composables/agenda/agendaModel";

/** The next events from now among those read, soonest first; a click opens one. */
const ctx = useAgendaContext();
const { t } = useI18n();

const MINUTE_MS = 60_000;
const now = useNow({ interval: MINUTE_MS });

const items = computed(() =>
  upcomingOccurrences(ctx.occurrences.value, now.value.getTime()),
);
const whenOf = (occurrence: AgendaOccurrence) => {
  const day = ctx.format.day(occurrence.startDay, "medium");
  if (occurrence.allDay) return day;
  return `${day} · ${ctx.format.timeRange(occurrence.start, occurrence.end)}`;
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
