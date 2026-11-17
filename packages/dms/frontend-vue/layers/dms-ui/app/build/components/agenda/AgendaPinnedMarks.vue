<script setup lang="ts">
import { ALERT_MARK_TONES } from "../../composables/agenda/agendaChip";
import type { AgendaBadge } from "../../../types/full-agenda";

/** The pinned states of an event (an overbooked slot) as one icon each, named by the chip's name. */
interface AgendaPinnedMarksProps {
  badges: readonly AgendaBadge[];
  iconClass: string;
}

const props = defineProps<AgendaPinnedMarksProps>();
</script>

<template>
  <UIcon
    v-for="(badge, index) in props.badges"
    :key="index"
    :name="badge.icon ?? 'i-ph-flag'"
    aria-hidden="true"
    data-agenda-pinned-mark
    class="shrink-0"
    :class="[props.iconClass, ALERT_MARK_TONES[badge.tone ?? 'neutral']]"
  />
</template>
