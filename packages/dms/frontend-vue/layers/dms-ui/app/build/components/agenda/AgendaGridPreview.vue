<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import {
  timedSegment,
  type AgendaGridColumn,
} from "../../composables/agenda/agendaTimeGridLayout";
import { placementSpan } from "../../composables/agenda/agendaTimeGridParts";
import type { AgendaGridMetrics } from "../../composables/agenda/useAgendaTimeGrid";
import AgendaGhost from "./AgendaGhost.vue";

/**
 * Where a drag would put an event in the body of a time grid: a ghost in
 * each column the placement crosses, laid over the columns in the same CSS
 * grid. It alone reads the preview, so the columns and their chips do not
 * redraw while the pointer moves.
 */
interface AgendaGridPreviewProps {
  columns: AgendaGridColumn[];
  metrics: AgendaGridMetrics;
  template: string;
}

const props = defineProps<AgendaGridPreviewProps>();

const ctx = useAgendaContext();

const MINUTES_PER_HOUR = 60;

interface PreviewBox {
  column: number;
  top: number;
  height: number;
}

const boxes = computed<PreviewBox[]>(() => {
  const preview = ctx.drag.preview.value;
  if (!preview || preview.toPending) return [];
  const span = placementSpan(preview, ctx.options.value.timeZone);
  const { dayStart, dayEnd, hourHeight, minMinutes } = props.metrics;
  const px = (minutes: number) =>
    ((minutes - dayStart) / MINUTES_PER_HOUR) * hourHeight;
  const found: PreviewBox[] = [];
  props.columns.forEach((column, index) => {
    const segment = timedSegment(span, column, dayStart, dayEnd, minMinutes);
    if (segment)
      found.push({
        column: index,
        top: px(segment.top),
        height: px(segment.bottom) - px(segment.top),
      });
  });
  return found;
});
</script>

<template>
  <div
    v-if="boxes.length"
    class="pointer-events-none absolute inset-0 z-[25] grid"
    :style="{ gridTemplateColumns: props.template, gridTemplateRows: '100%' }"
    aria-hidden="true"
  >
    <div
      v-for="(box, index) in boxes"
      :key="box.column"
      class="relative"
      :style="{ gridColumn: box.column + 2, gridRow: 1 }"
    >
      <div
        class="absolute inset-x-0.5"
        :style="{
          top: `${box.top}px`,
          height: `${Math.max(box.height - 1, 1)}px`,
        }"
      >
        <AgendaGhost
          :preview="ctx.drag.preview.value"
          :show-reason="index === 0"
          class="size-full"
        />
      </div>
    </div>
  </div>
</template>
