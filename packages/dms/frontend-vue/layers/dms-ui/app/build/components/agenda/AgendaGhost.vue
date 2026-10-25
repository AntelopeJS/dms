<script setup lang="ts">
import { computed } from "vue";
import type {
  AgendaDragPreview,
  AgendaOccurrence,
  AgendaPaint,
} from "../../composables/agenda/agendaModel";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { agendaPaint } from "../../composables/agenda/agendaPaint";
import { lastDayOf } from "../../composables/agenda/agendaDragMath";
import { zonedDayKey } from "../../composables/agenda/agendaTime";

/**
 * A see-through event filling the box its view places it in: with
 * `occurrence`, where a staged change moved it from (dashed, faded); with
 * `preview`, where the drag would put it (its colours, the new time, a copy
 * mark, red with the reason when the drop is refused).
 */
interface AgendaGhostProps {
  occurrence?: AgendaOccurrence;
  preview?: AgendaDragPreview | null;
  /** Shows the refusal under the box (the first piece of a cut preview). */
  showReason?: boolean;
}

const props = withDefaults(defineProps<AgendaGhostProps>(), {
  occurrence: undefined,
  preview: null,
  showReason: true,
});

const ctx = useAgendaContext();
const { t } = useI18n();

const dragged = computed(() => {
  const key = props.preview?.occurrenceKey;
  return key
    ? ctx.occurrences.value.find((occurrence) => occurrence.key === key)
    : undefined;
});
const item = computed(() => {
  const id = props.preview?.itemId;
  return id
    ? ctx.pending.value.find((pending) => pending.id === id)
    : undefined;
});

const paint = computed<AgendaPaint>(() => {
  const subject = props.occurrence ?? dragged.value;
  if (subject) return subject.paint;
  const create = ctx.options.value.raw.create;
  const calendarId =
    item.value?.calendarId ??
    (typeof create === "object" ? create.calendarId : undefined) ??
    ctx.calendars.value[0]?.id;
  const calendar = ctx.calendars.value.find(
    (candidate) => candidate.id === calendarId,
  );
  return agendaPaint(item.value?.color ?? calendar?.color);
});

const title = computed(
  () =>
    props.occurrence?.event.title ??
    dragged.value?.event.title ??
    item.value?.title ??
    t("dms.agenda.grid.new_event"),
);

const when = computed(() => {
  const preview = props.preview;
  if (!preview) return "";
  if (!preview.allDay) return ctx.format.timeRange(preview.start, preview.end);
  const timeZone = ctx.options.value.timeZone;
  const first = zonedDayKey(preview.start, timeZone);
  const last = lastDayOf(preview, timeZone);
  return first === last
    ? ctx.format.day(first, "medium")
    : t("dms.agenda.grid.day_range", {
        start: ctx.format.day(first, "medium"),
        end: ctx.format.day(last, "medium"),
      });
});

const isRefused = computed(
  () =>
    props.preview !== null &&
    props.preview !== undefined &&
    !props.preview.valid,
);

const style = computed(() => ({
  "--agenda-tint": paint.value.background,
  "--agenda-bar": paint.value.bar,
  "--agenda-ink": paint.value.text,
}));
</script>

<template>
  <div
    aria-hidden="true"
    class="pointer-events-none relative"
    :style="style"
    data-agenda-ghost
  >
    <div
      class="flex size-full min-w-0 flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-xs leading-tight"
      :class="
        props.preview
          ? isRefused
            ? 'text-error border-2 border-dashed border-(--ui-error) bg-(--ui-error)/10'
            : 'border-2 border-dashed border-(--agenda-bar) bg-(--agenda-tint) text-(--agenda-ink) shadow-md'
          : 'border border-dashed border-(--agenda-bar) bg-(--agenda-tint)/40 text-(--agenda-ink) opacity-60'
      "
    >
      <span class="flex min-w-0 items-center gap-1">
        <UIcon
          v-if="props.preview?.copy"
          name="i-ph-copy"
          class="size-3.5 shrink-0"
        />
        <UIcon
          v-if="!props.preview"
          name="i-ph-arrow-bend-up-left"
          class="size-3 shrink-0"
        />
        <span class="min-w-0 truncate font-medium">{{ title }}</span>
      </span>
      <span v-if="when" class="truncate tabular-nums opacity-80">
        {{ when }}
      </span>
    </div>
    <span
      v-if="isRefused && props.showReason && props.preview?.reason"
      class="bg-error text-inverted absolute start-0 top-full z-10 mt-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap shadow-sm"
    >
      {{ props.preview.reason }}
    </span>
  </div>
</template>
