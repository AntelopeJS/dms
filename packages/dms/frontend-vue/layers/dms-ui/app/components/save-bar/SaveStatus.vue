<script setup lang="ts">
export type SaveStatusState = "idle" | "saving" | "saved" | "error";

interface SaveStatusProps {
  /**
   * Instant-save feedback: nothing, a spinner while saving, a tick once
   * saved, "Not saved" and a Retry button once a save failed.
   */
  state: SaveStatusState;
}

const props = defineProps<SaveStatusProps>();
const emit = defineEmits<{
  /** Retry asked for, after a failed save. */
  retry: [];
}>();
const { t } = useI18n();

interface SaveStatusLook {
  icon: string;
  label: string;
  class: string;
}

const LOOKS: Record<Exclude<SaveStatusState, "idle">, SaveStatusLook> = {
  saving: {
    icon: "i-ph-circle-notch",
    label: "dms.save_bar.saving",
    class: "text-muted",
  },
  saved: {
    icon: "i-ph-check",
    label: "dms.save_bar.saved",
    class: "text-success",
  },
  error: {
    icon: "i-ph-warning-circle",
    label: "dms.save_bar.not_saved",
    class: "text-error",
  },
};
</script>

<template>
  <!-- v2 .st-saved / .cs-saving: a mono stamp next to an instant-save control. -->
  <span
    v-if="props.state !== 'idle'"
    class="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium"
    :class="LOOKS[props.state].class"
    role="status"
  >
    <UIcon
      :name="LOOKS[props.state].icon"
      class="size-3"
      :class="{ 'animate-spin': props.state === 'saving' }"
    />
    {{ t(LOOKS[props.state].label) }}
    <UButton
      v-if="props.state === 'error'"
      :label="t('dms.save_bar.retry')"
      icon="i-ph-arrows-clockwise"
      color="neutral"
      variant="link"
      size="xs"
      class="font-sans"
      @click="emit('retry')"
    />
  </span>
</template>
