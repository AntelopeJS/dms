<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAgendaContext } from "../../composables/agenda/useAgenda";
import { zonedDayKey, zonedMinutes } from "../../composables/agenda/agendaTime";

/**
 * The current time across a day column of a time grid, in the agenda's
 * zone: a line and a dot on its leading edge. Drawn once mounted (the
 * server's time is not the reader's) and moved by the agenda's clock.
 */
interface AgendaNowLineProps {
  dayKey: string;
  /** Minutes the column starts and ends at. */
  dayStart: number;
  dayEnd: number;
  hourHeight: number;
  /** The dot on the leading edge (the first column of the day). */
  withDot?: boolean;
}

const props = withDefaults(defineProps<AgendaNowLineProps>(), {
  withDot: true,
});

const ctx = useAgendaContext();
const { t } = useI18n();

const MINUTES_PER_HOUR = 60;

const isMounted = ref(false);
onMounted(() => {
  isMounted.value = true;
});

const top = computed(() => {
  if (!isMounted.value) return null;
  const timeZone = ctx.options.value.timeZone;
  const epoch = ctx.now.value;
  if (zonedDayKey(epoch, timeZone) !== props.dayKey) return null;
  const minutes = zonedMinutes(epoch, timeZone);
  if (minutes < props.dayStart || minutes > props.dayEnd) return null;
  return ((minutes - props.dayStart) / MINUTES_PER_HOUR) * props.hourHeight;
});
</script>

<template>
  <div
    v-if="top !== null"
    class="pointer-events-none absolute inset-x-0 z-[15] h-0.5 bg-(--ui-error)"
    :style="{ top: `${top}px` }"
    role="presentation"
    :title="t('dms.agenda.grid.now')"
    data-agenda-now
  >
    <span
      v-if="props.withDot"
      class="absolute -start-1 -top-[3px] size-2 rounded-full bg-(--ui-error)"
    />
  </div>
</template>
