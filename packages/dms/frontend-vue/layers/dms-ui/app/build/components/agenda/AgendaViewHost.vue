<script setup lang="ts">
import { computed, type Component } from "vue";
import AgendaListView from "./AgendaListView.vue";
import AgendaMonthView from "./AgendaMonthView.vue";
import AgendaTimeGrid from "./AgendaTimeGrid.vue";
import AgendaTimelineView from "./AgendaTimelineView.vue";
import AgendaYearView from "./AgendaYearView.vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import type { AgendaViewType } from "../../../types/full-agenda";

/**
 * The view the agenda draws (`ctx.view`): a time grid for `day`, `week`,
 * `days` and `resources`, the month, the timeline, the year or the list.
 * Each view reads the context itself; a new view mounts afresh.
 */
const ctx = useAgendaContext();

const VIEW_COMPONENTS: Record<AgendaViewType, Component> = {
  day: AgendaTimeGrid,
  week: AgendaTimeGrid,
  days: AgendaTimeGrid,
  resources: AgendaTimeGrid,
  month: AgendaMonthView,
  timeline: AgendaTimelineView,
  year: AgendaYearView,
  list: AgendaListView,
};

const view = computed(() => ctx.view.value);
const component = computed(() => VIEW_COMPONENTS[view.value.type]);
</script>

<template>
  <Component
    :is="component"
    :key="view.id"
    class="min-h-0 flex-1"
    :data-agenda-view="view.type"
  />
</template>
