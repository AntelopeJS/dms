<script setup lang="ts">
import { computed } from "vue";
import type { AgendaOccurrence } from "../../composables/agenda/agendaModel";
import { MARK_DISC_CLASSES } from "../../composables/agenda/agendaChip";
import { useComposedText } from "../../../../../dms-core/app/composables/translation/useComposedText";
import type { AgendaMarkTone } from "../../../types/full-agenda";

/**
 * The hover bubble of an event chip: its title, status mark, pinned states,
 * time, calendar, place, description, issues and save state. The status sits on a pill of its tone, the colours of its
 * disc on the chip, so it reads at the contrast of white on the tone's dark
 * shade in light mode and of black on its light shade in dark mode, whatever
 * the bubble's own inverted background.
 */
interface AgendaChipTooltipProps {
  occurrence: AgendaOccurrence;
  mark: { icon: string; tone: AgendaMarkTone; label: string } | null;
  /** The names of the event's pinned states (an overbooked slot). */
  pinned: readonly string[];
  when: string;
  calendar: string;
  description: string;
}

const props = defineProps<AgendaChipTooltipProps>();
const { processText } = useComposedText();
const event = computed(() => props.occurrence.event);
const issues = computed(() => event.value.issues ?? []);
</script>

<template>
  <div class="flex max-w-72 flex-col gap-1 py-0.5 text-xs">
    <span class="text-inverted font-semibold">{{ event.title }}</span>
    <span
      v-if="props.mark"
      data-agenda-tooltip-status
      class="flex w-fit items-center gap-1 rounded-full px-1.5 py-0.5 font-medium"
      :class="MARK_DISC_CLASSES[props.mark.tone]"
    >
      <UIcon :name="props.mark.icon" class="size-3" />
      {{ props.mark.label }}
    </span>
    <span
      v-for="(label, index) in props.pinned"
      :key="index"
      data-agenda-tooltip-pinned
      class="text-inverted font-medium"
    >
      {{ label }}
    </span>
    <span class="text-inverted/70">{{ props.when }}</span>
    <span v-if="props.calendar" class="text-inverted/70">
      {{ props.calendar }}
    </span>
    <span v-if="event.location" class="flex items-center gap-1">
      <UIcon name="i-ph-map-pin" class="size-3" />
      {{ event.location }}
    </span>
    <span v-if="props.description" class="line-clamp-4">
      {{ props.description }}
    </span>
    <span
      v-for="(issue, index) in issues"
      :key="index"
      :class="issue.tone === 'error' ? 'text-error' : 'text-warning'"
    >
      {{ processText(issue.message) }}
    </span>
    <span v-if="props.occurrence.stateMessage" class="text-error">
      {{ props.occurrence.stateMessage }}
    </span>
  </div>
</template>
