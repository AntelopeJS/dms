<script setup lang="ts">
import { computed } from "vue";
import type { AgendaDragPreview } from "../../composables/agenda/agendaModel";
import {
  placeSpan,
  type TimelineColumn,
  type TimelineMetrics,
  type TimelinePlaced,
  type TimelineResourceRow,
  type TimelineSegment,
} from "../../composables/agenda/agendaTimelineLayout";
import type { TimelineShade } from "../../composables/agenda/agendaTimelineShading";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import AgendaEventChip from "./AgendaEventChip.vue";
import AgendaGhost from "./AgendaGhost.vue";

/**
 * The time area of one resource row: its shading (hours outside business
 * hours, backgrounds), its events in lanes (a long one in a segment per day,
 * the later ones marked as continuing), staged ghosts, and the drag preview
 * when it falls on this row.
 */
const props = defineProps<{
  row: TimelineResourceRow;
  columns: TimelineColumn[];
  breaks: number[];
  shades: TimelineShade[];
  metrics: TimelineMetrics;
  preview: AgendaDragPreview | null;
  /** A timeline by day: the preview takes whole days, as the events do. */
  wholeColumns?: boolean;
}>();

const { t } = useI18n();
const { processText } = useComposedText();

/** Pixels between two stacked lanes. */
const LANE_GAP = 2;

const count = computed(() => Math.max(1, props.columns.length));
const percent = (position: number) => `${(position / count.value) * 100}%`;

function segmentStyle(item: TimelinePlaced, segment: TimelineSegment) {
  const { laneHeight, rowPadding } = props.metrics;
  return {
    left: percent(segment.from),
    width: percent(segment.to - segment.from),
    top: `${rowPadding + item.lane * laneHeight}px`,
    height: `${laneHeight - LANE_GAP}px`,
  };
}

const shadeStyle = (shade: TimelineShade) => ({
  ...shade.style,
  left: percent(shade.from),
  width: percent(shade.to - shade.from),
});

const previewHere = computed(() => {
  const preview = props.preview;
  if (!preview || preview.toPending) return null;
  const id = props.row.resource?.id;
  const onRow = id
    ? preview.resourceIds.includes(id)
    : !preview.resourceIds.length;
  if (!onRow) return null;
  return placeSpan(props.columns, preview.start, preview.end, props.breaks, {
    wholeColumns: props.wholeColumns,
  });
});

const previewStyle = (segment: TimelineSegment) => ({
  left: percent(segment.from),
  width: percent(segment.to - segment.from),
  top: `${props.metrics.rowPadding}px`,
  bottom: `${props.metrics.rowPadding}px`,
});

const continuation = (segment: TimelineSegment, index: number) =>
  index > 0 || segment.continuesBefore;
</script>

<template>
  <div class="relative h-full min-w-0 flex-1" role="gridcell">
    <div
      v-for="shade in shades"
      :key="shade.key"
      class="absolute inset-y-0"
      :style="shadeStyle(shade)"
      :title="shade.label ? processText(shade.label) : undefined"
    />
    <template v-for="item in row.items" :key="item.key">
      <div
        v-for="(segment, index) in item.segments"
        :key="`${item.key}:${index}`"
        class="absolute z-[1] px-px"
        :class="item.ghost ? 'pointer-events-none' : ''"
        :style="segmentStyle(item, segment)"
        :data-agenda-occurrence="item.ghost ? undefined : item.occurrence.key"
      >
        <AgendaGhost
          v-if="item.ghost"
          :occurrence="item.occurrence"
          class="size-full"
        />
        <AgendaEventChip
          v-else
          :occurrence="item.occurrence"
          layout="bar"
          :continues-before="continuation(segment, index)"
          :continues-after="segment.continuesAfter"
          class="size-full"
        />
        <span
          v-if="!item.ghost && continuation(segment, index)"
          class="pointer-events-none absolute inset-y-0 start-0 flex items-center"
          :title="t('dms.agenda.timeline.continues_before')"
        >
          <UIcon name="i-ph-caret-left-bold" class="text-muted size-2.5" />
        </span>
        <span
          v-if="!item.ghost && segment.continuesAfter"
          class="pointer-events-none absolute inset-y-0 end-0 flex items-center"
          :title="t('dms.agenda.timeline.continues_after')"
        >
          <UIcon name="i-ph-caret-right-bold" class="text-muted size-2.5" />
        </span>
      </div>
    </template>
    <template v-if="previewHere && preview">
      <div
        v-for="(segment, index) in previewHere.segments"
        :key="`preview:${index}`"
        class="pointer-events-none absolute z-[2] px-px"
        :style="previewStyle(segment)"
      >
        <AgendaGhost
          :preview="preview"
          :show-reason="index === 0"
          class="size-full"
        />
      </div>
    </template>
  </div>
</template>
