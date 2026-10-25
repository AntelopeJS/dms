<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { agendaPaint } from "../../composables/agenda/agendaPaint";
import {
  legendGroups,
  type ResolvedAgendaLegend,
} from "../../composables/agenda/agendaShell";
import type { AgendaCalendar } from "../../../types/full-agenda";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The calendars of the agenda: a box in each calendar's colour (a toggle
 * showing or hiding its events with `toggles`), its count in the range, by
 * group. A list in the sidebar, a wrapping line above or under the views.
 */
interface AgendaLegendProps {
  legend: ResolvedAgendaLegend;
  layout: "list" | "inline";
}

const props = defineProps<AgendaLegendProps>();
const ctx = useAgendaContext();
const { t } = useI18n();
const { processText } = useComposedText();

const groups = computed(() =>
  legendGroups(ctx.calendars.value, ctx.calendarGroups.value),
);
const title = computed(() =>
  props.legend.title
    ? processText(props.legend.title)
    : t("dms.agenda.sidebar.calendars"),
);
const isShown = (calendar: AgendaCalendar) =>
  !ctx.hiddenCalendars.value.has(calendar.id);
const countOf = (calendar: AgendaCalendar) =>
  ctx.calendarCounts.value[calendar.id] ?? 0;
const swatchStyle = (calendar: AgendaCalendar) => {
  const paint = agendaPaint(calendar.color);
  return isShown(calendar)
    ? { backgroundColor: paint.bar, borderColor: paint.bar, color: paint.onBar }
    : { borderColor: paint.bar };
};
const toggleLabel = (calendar: AgendaCalendar) =>
  t(
    isShown(calendar)
      ? "dms.agenda.sidebar.hide_calendar"
      : "dms.agenda.sidebar.show_calendar",
    { name: processText(calendar.label) },
  );
const isInline = computed(() => props.layout === "inline");
</script>

<template>
  <section
    :aria-label="title"
    data-agenda-legend
    :class="
      isInline
        ? 'flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2'
        : 'flex flex-col gap-3'
    "
  >
    <h3
      v-if="!isInline"
      class="text-muted text-xs font-semibold tracking-wide uppercase"
    >
      {{ title }}
    </h3>
    <div
      v-for="group in groups"
      :key="group.id"
      :class="isInline ? 'contents' : 'flex flex-col gap-1'"
    >
      <h4
        v-if="group.label && !isInline"
        class="text-dimmed mt-1 text-[11px] font-medium"
      >
        {{ processText(group.label) }}
      </h4>
      <component
        :is="props.legend.toggles ? 'button' : 'div'"
        v-for="calendar in group.calendars"
        :key="calendar.id"
        :type="props.legend.toggles ? 'button' : undefined"
        :aria-pressed="props.legend.toggles ? isShown(calendar) : undefined"
        :aria-label="props.legend.toggles ? toggleLabel(calendar) : undefined"
        :data-agenda-calendar="calendar.id"
        :class="[
          'flex min-w-0 items-center gap-2 rounded-md text-start text-sm',
          props.legend.toggles &&
            'hover:bg-elevated focus-visible:ring-primary -mx-1.5 px-1.5 py-1 focus-visible:ring-2 focus-visible:outline-none',
          !isShown(calendar) && 'text-dimmed',
        ]"
        @click="props.legend.toggles && ctx.toggleCalendar(calendar.id)"
      >
        <span
          class="grid size-3.5 shrink-0 place-items-center rounded-[4px] border-2"
          :style="swatchStyle(calendar)"
          aria-hidden="true"
        >
          <UIcon
            v-if="props.legend.toggles && isShown(calendar)"
            name="i-ph-check-bold"
            class="size-2.5"
          />
        </span>
        <UIcon
          v-if="calendar.icon"
          :name="calendar.icon"
          class="text-muted size-4 shrink-0"
        />
        <span class="min-w-0 flex-1 truncate">
          {{ processText(calendar.label) }}
        </span>
        <span
          v-if="props.legend.counts"
          class="text-dimmed font-mono text-xs tabular-nums"
        >
          {{ countOf(calendar) }}
        </span>
      </component>
    </div>
  </section>
</template>
