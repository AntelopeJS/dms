<script setup lang="ts">
import type { AgendaTimelineScale } from "../../../types/full-agenda";
import type { AgendaFormat } from "../../composables/agenda/agendaModel";
import type { ParsedAgendaSlot } from "../../composables/agenda/agendaSlots";
import type {
  TimelineColumn,
  TimelineHeaderGroup,
} from "../../composables/agenda/agendaTimelineLayout";
import { TIMELINE_HEADER_HEIGHT } from "../../composables/agenda/useAgendaTimeline";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";

/**
 * The two-level header of a timeline, sticky at the top: days over their
 * hours or slots (weeks over days in a timeline by day), with the corner
 * cell sticky over the resource column.
 */
const props = defineProps<{
  scale: AgendaTimelineScale;
  columns: TimelineColumn[];
  groups: TimelineHeaderGroup[];
  slots: ParsedAgendaSlot[];
  format: AgendaFormat;
  resourceWidth: number;
  cornerLabel: string;
}>();

const { t } = useI18n();
const { processText } = useComposedText();

const share = (count: number) =>
  `${(count / Math.max(1, props.columns.length)) * 100}%`;

function groupLabel(group: TimelineHeaderGroup): string {
  if (props.scale !== "day") return props.format.day(group.day.key, "medium");
  const month = props.format.month(group.day.year, group.day.month);
  return `${t("dms.agenda.timeline.week", { week: group.week })} · ${month}`;
}

function columnLabel(column: TimelineColumn): string {
  if (props.scale === "day")
    return props.format.day(column.day, "weekdayShort");
  if (props.scale === "slot") {
    const slot = props.slots[column.slotIndex ?? 0];
    return slot ? processText(slot.label) : "";
  }
  return props.format.time(column.start);
}

function columnTitle(column: TimelineColumn): string {
  const day = props.format.day(column.day, "long");
  if (props.scale === "day") return day;
  return `${day} · ${props.format.timeRange(column.start, column.end)}`;
}
</script>

<template>
  <div
    class="border-default bg-default sticky top-0 z-20 flex border-b"
    role="row"
    :style="{ height: `${TIMELINE_HEADER_HEIGHT}px` }"
  >
    <div
      class="border-default bg-default text-muted sticky left-0 z-30 flex shrink-0 items-end border-e px-2 pb-1.5 text-xs font-medium"
      role="columnheader"
      :style="{ width: `${resourceWidth}px` }"
    >
      <span class="truncate">{{ cornerLabel }}</span>
    </div>
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="border-default flex h-1/2 border-b">
        <div
          v-for="group in groups"
          :key="group.key"
          class="border-accented flex min-w-0 items-center border-s px-2 text-xs font-semibold first:border-s-0"
          :class="
            scale !== 'day' && group.day.isToday
              ? 'text-primary'
              : 'text-highlighted'
          "
          :style="{ width: share(group.count) }"
        >
          <span class="truncate">
            <template v-if="scale !== 'day' && group.day.isToday">
              {{ t("dms.agenda.timeline.today") }} ·
            </template>
            {{ groupLabel(group) }}
          </span>
        </div>
      </div>
      <div class="flex h-1/2">
        <div
          v-for="column in columns"
          :key="column.index"
          role="columnheader"
          class="flex min-w-0 items-center justify-center border-s text-[11px] tabular-nums first:border-s-0"
          :class="[
            column.firstOfDay || scale === 'day'
              ? 'border-accented'
              : 'border-default',
            column.isToday && scale === 'day'
              ? 'text-primary font-semibold'
              : 'text-muted',
          ]"
          :style="{ width: share(1) }"
          :title="columnTitle(column)"
        >
          <span class="truncate px-0.5">
            {{ columnLabel(column) }}
            <template v-if="scale === 'day'">
              {{ column.day.slice(8, 10).replace(/^0/, "") }}
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
