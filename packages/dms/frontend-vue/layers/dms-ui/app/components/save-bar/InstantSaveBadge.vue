<script setup lang="ts">
import type { SaveStatusState } from "./SaveStatus.vue";

interface InstantSaveBadgeProps {
  /**
   * Save activity of the page, for a subtle "just saved" flash: the pill
   * reads "Saving" with a spinning icon while a change is being written,
   * then "Saved instantly" with a tick once it is, and turns red with "Not
   * saved" while a save failed (the control says which). Defaults to `idle`
   * (a lightning bolt and "Saved instantly").
   */
  state?: SaveStatusState;
}

const props = withDefaults(defineProps<InstantSaveBadgeProps>(), {
  state: "idle",
});
const { t } = useI18n();

const ICONS: Record<SaveStatusState, string> = {
  idle: "i-ph-lightning",
  saving: "i-ph-circle-notch",
  saved: "i-ph-check",
  error: "i-ph-warning-circle",
};

const LABELS: Record<SaveStatusState, string> = {
  idle: "dms.save_bar.instant",
  saving: "dms.save_bar.saving",
  saved: "dms.save_bar.instant",
  error: "dms.save_bar.not_saved",
};

const TONE_CLASSES = {
  ok: "border-success/40 bg-success/10 text-success",
  error: "border-error/40 bg-error/10 text-error",
};
</script>

<template>
  <!--
    v2 .cs-instant: the one header pill of every instant-save page (no save
    bar). Rendered through usePageHeaderActions, identical everywhere.
  -->
  <span
    class="inline-flex h-7 items-center gap-[7px] rounded-full border px-[11px] text-xs font-[550] whitespace-nowrap transition-shadow duration-300"
    :class="[
      TONE_CLASSES[props.state === 'error' ? 'error' : 'ok'],
      { 'ring-success/25 ring-2': props.state === 'saved' },
    ]"
    :title="t('dms.save_bar.instant_hint')"
    :data-state="props.state"
    data-instant-save-badge
  >
    <UIcon
      :name="ICONS[props.state]"
      class="size-3.5 shrink-0"
      :class="{ 'animate-spin': props.state === 'saving' }"
    />
    {{ t(LABELS[props.state]) }}
  </span>
</template>
