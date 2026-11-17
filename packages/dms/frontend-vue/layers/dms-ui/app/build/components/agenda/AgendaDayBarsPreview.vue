<script setup lang="ts">
import { computed } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { lastDayOf } from "../../composables/agenda/agendaDragBasics";
import { DAY_MS, zonedDayKey } from "../../composables/agenda/agendaTime";
import AgendaGhost from "./AgendaGhost.vue";

/**
 * The drag preview over a row of day columns (the all-day row of a time
 * grid, a week of the month): a ghost bar over each run of columns the
 * placement covers, laid in the parent CSS grid. It alone reads the preview,
 * so the row and its chips do not redraw while the pointer moves.
 */
interface DayColumn {
  day: string;
  resourceId?: string;
  /** The "No resource" column: a placement on no resource. */
  unassigned?: boolean;
}

interface AgendaDayBarsPreviewProps {
  columns: DayColumn[];
  /** The parent grid's column of the first day (after a gutter). */
  firstGridColumn: number;
  gridRow: number;
  /** Timed placements too (a month cell), not only all-day ones (the all-day row). */
  includeTimed?: boolean;
}

const props = withDefaults(defineProps<AgendaDayBarsPreviewProps>(), {
  includeTimed: false,
});

const ctx = useAgendaContext();

interface PreviewRun {
  first: number;
  last: number;
}

const runs = computed<PreviewRun[]>(() => {
  const preview = ctx.drag.preview.value;
  if (!preview || preview.toPending) return [];
  const isDayLong = preview.allDay || preview.end - preview.start >= DAY_MS;
  if (!isDayLong && !props.includeTimed) return [];
  const timeZone = ctx.options.value.timeZone;
  const first = zonedDayKey(preview.start, timeZone);
  const last = lastDayOf(preview, timeZone);
  const found: PreviewRun[] = [];
  props.columns.forEach((column, index) => {
    const onResource = column.unassigned
      ? !preview.resourceIds.length
      : !column.resourceId || preview.resourceIds.includes(column.resourceId);
    if (!onResource || column.day < first || column.day > last) return;
    const run = found.at(-1);
    if (run && run.last === index - 1) run.last = index;
    else found.push({ first: index, last: index });
  });
  return found;
});
</script>

<template>
  <div
    v-for="(run, index) in runs"
    :key="`${run.first}-${run.last}`"
    class="pointer-events-none relative z-20 h-5 px-px"
    :style="{
      gridColumn: `${props.firstGridColumn + run.first} / span ${run.last - run.first + 1}`,
      gridRow: props.gridRow,
    }"
  >
    <AgendaGhost
      :preview="ctx.drag.preview.value"
      :show-reason="index === 0"
      class="size-full"
    />
  </div>
</template>
