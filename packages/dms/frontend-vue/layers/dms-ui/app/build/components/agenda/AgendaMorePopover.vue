<script setup lang="ts">
import { computed, ref } from "vue";
import type {
  AgendaDay,
  AgendaOccurrence,
} from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import AgendaEventChip from "./AgendaEventChip.vue";

/**
 * The "+N more" of a crowded month day: a button opening every event of the
 * day in a popover (each one opens, moves and copies as on the grid), with
 * the day's name leading to its day view.
 */
interface AgendaMorePopoverProps {
  day: AgendaDay;
  /** Every event of the day, in drawing order. */
  occurrences: AgendaOccurrence[];
  /** How many of them the cell does not draw. */
  count: number;
  /** In the tab order (the month grid has one roving tab stop). */
  tabbable?: boolean;
  /** Its name in the month's roving set. */
  roving?: string;
}

const props = withDefaults(defineProps<AgendaMorePopoverProps>(), {
  tabbable: true,
  roving: "",
});

const ctx = useAgendaContext();
const { t } = useI18n();

const isOpen = ref(false);
const dayLabel = computed(() => ctx.format.day(props.day.key, "long"));

const layoutOf = (occurrence: AgendaOccurrence) =>
  occurrence.allDay || occurrence.startDay !== occurrence.endDay
    ? "bar"
    : "dot";

function openDay(): void {
  isOpen.value = false;
  ctx.goTo(props.day.key, "day");
}
</script>

<template>
  <UPopover
    v-model:open="isOpen"
    :content="{ side: 'bottom', align: 'start', sideOffset: 4 }"
  >
    <button
      type="button"
      class="text-muted hover:text-highlighted hover:bg-elevated w-full truncate rounded-md px-1.5 text-start text-xs font-medium"
      :tabindex="props.tabbable ? 0 : -1"
      :data-agenda-roving="props.roving"
      :aria-label="
        t(
          'dms.agenda.month.more_label',
          { count: props.count, day: dayLabel },
          props.count,
        )
      "
      @pointerdown.stop
      @click.stop
    >
      {{ t("dms.agenda.month.more", { count: props.count }) }}
    </button>
    <template #content>
      <div
        class="flex w-64 flex-col gap-1 p-2"
        role="dialog"
        :aria-label="dayLabel"
      >
        <button
          type="button"
          class="text-highlighted hover:text-primary mb-1 self-start text-sm font-semibold"
          @click="openDay"
        >
          {{ dayLabel }}
        </button>
        <ul class="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
          <li
            v-for="occurrence in props.occurrences"
            :key="occurrence.key"
            class="h-6"
          >
            <AgendaEventChip
              :occurrence="occurrence"
              :layout="layoutOf(occurrence)"
              :continues-before="occurrence.startDay < props.day.key"
              :continues-after="occurrence.endDay > props.day.key"
            />
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>
