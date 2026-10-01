<script setup lang="ts">
export type SaveStatusState = "idle" | "saving" | "saved";

interface SaveStatusProps {
  /** Instant-save feedback: nothing, a spinner while saving, then a tick. */
  state: SaveStatusState;
}

const props = defineProps<SaveStatusProps>();
const { t } = useI18n();
</script>

<template>
  <!-- v2 .st-saved / .cs-saving: a mono stamp next to an instant-save control. -->
  <span
    v-if="props.state !== 'idle'"
    class="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium"
    :class="props.state === 'saved' ? 'text-success' : 'text-muted'"
    role="status"
  >
    <UIcon
      :name="props.state === 'saved' ? 'i-ph-check' : 'i-ph-circle-notch'"
      class="size-3"
      :class="{ 'animate-spin': props.state === 'saving' }"
    />
    {{
      props.state === "saved"
        ? t("dms.save_bar.saved")
        : t("dms.save_bar.saving")
    }}
  </span>
</template>
