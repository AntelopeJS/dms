<script setup lang="ts">
import { computed } from "vue";
import type {
  AgendaGridColumnLayout,
  AgendaGridMetrics,
} from "../../composables/agenda/useAgendaTimeGrid";
import type { AgendaMinutePiece } from "../../composables/agenda/agendaTimeGridParts";
import { CLOSED_HOURS_STYLE } from "../../composables/agenda/agendaBackgroundSpans";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import AgendaEventChip from "./AgendaEventChip.vue";
import AgendaGhost from "./AgendaGhost.vue";
import AgendaNowLine from "./AgendaNowLine.vue";

/**
 * One column of a time grid (a day, or a resource on a day): the hours
 * outside business hours shaded, the backgrounds with their labels, the
 * staged ghosts, the events laid out side by side or stacked, and the line
 * of the current time on today's columns.
 */
interface AgendaGridColumnProps {
  layout: AgendaGridColumnLayout;
  metrics: AgendaGridMetrics;
  /** The first column of its day: the now line carries its dot. */
  isFirstOfDay?: boolean;
}

const props = withDefaults(defineProps<AgendaGridColumnProps>(), {
  isFirstOfDay: true,
});

const ctx = useAgendaContext();
const { processText } = useComposedText();

const MINUTES_PER_HOUR = 60;
/** Pixels between two events side by side, and on the column's right for a click on empty time. */
const GAP_PX = 2;
const RIGHT_ROOM_PX = 6;

const px = (minutes: number) =>
  ((minutes - props.metrics.dayStart) / MINUTES_PER_HOUR) *
  props.metrics.hourHeight;
const pieceStyle = (piece: AgendaMinutePiece) => ({
  top: `${px(piece.top)}px`,
  height: `${px(piece.bottom) - px(piece.top)}px`,
});

const showNow = computed(
  () =>
    ctx.options.value.raw.nowIndicator !== false &&
    props.layout.column.day.isToday,
);
const label = computed(() => {
  const { column } = props.layout;
  const day = ctx.format.day(column.day.key, "long");
  return column.resource
    ? `${processText(column.resource.label)}, ${day}`
    : day;
});

function itemStyle(item: AgendaGridColumnLayout["items"][number]) {
  return {
    top: `${item.top}px`,
    height: `${Math.max(item.height - 1, 1)}px`,
    left: `calc(${item.left * 100}% + ${GAP_PX / 2}px)`,
    width: `calc(${item.width * 100}% - ${item.isGhost ? GAP_PX : RIGHT_ROOM_PX}px)`,
    zIndex: item.isGhost ? 1 : item.z + 2,
  };
}
</script>

<template>
  <div
    class="relative min-w-0 border-e border-(--ui-border)"
    :class="props.layout.column.folded && 'bg-(--ui-bg-muted)'"
    role="gridcell"
    :aria-label="label"
    :data-agenda-day="props.layout.column.day.key"
    :data-agenda-resource="props.layout.column.resource?.id"
  >
    <div
      v-for="(piece, index) in props.layout.closed"
      :key="`closed-${index}`"
      class="absolute inset-x-0"
      :style="{ ...CLOSED_HOURS_STYLE, ...pieceStyle(piece) }"
    />
    <div
      v-for="piece in props.layout.backgrounds"
      :key="`bg-${piece.key}`"
      class="absolute inset-x-0 overflow-hidden"
      :style="{ ...piece.style, ...pieceStyle(piece) }"
    >
      <span
        v-if="piece.label && !piece.allDay"
        class="text-dimmed block truncate px-1 pt-0.5 text-[10px]"
      >
        {{ processText(piece.label) }}
      </span>
    </div>
    <div
      v-if="props.layout.isReadOnly"
      class="absolute inset-0 bg-(--ui-bg-muted)/50"
    />
    <div
      v-for="item in props.layout.items"
      :key="item.key"
      class="absolute"
      :class="item.isGhost && 'pointer-events-none'"
      :style="itemStyle(item)"
    >
      <AgendaGhost
        v-if="item.isGhost"
        :occurrence="item.occurrence"
        class="size-full"
      />
      <AgendaEventChip
        v-else
        :occurrence="item.occurrence"
        layout="block"
        :height="item.height"
        :continues-before="item.clippedStart"
        :continues-after="item.clippedEnd"
      />
    </div>
    <AgendaNowLine
      v-if="showNow"
      :day-key="props.layout.column.day.key"
      :day-start="props.metrics.dayStart"
      :day-end="props.metrics.dayEnd"
      :hour-height="props.metrics.hourHeight"
      :with-dot="props.isFirstOfDay"
    />
  </div>
</template>
