<script setup lang="ts">
import type { SaveStatusState } from "./SaveStatus.vue";

interface InstantSaveBadgeProps {
  /**
   * Save activity of the page, for a subtle "just saved" flash: the icon
   * spins while a change is being written and turns into a tick once it is.
   * The wording never changes. Defaults to `idle` (a lightning bolt).
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
};
</script>

<template>
  <!--
    v2 .cs-instant: the one header pill of every instant-save page (no save
    bar). Rendered through usePageHeaderActions, identical everywhere.
  -->
  <span
    class="border-success/40 bg-success/10 text-success inline-flex h-7 items-center gap-[7px] rounded-full border px-[11px] text-xs font-[550] whitespace-nowrap transition-shadow duration-300"
    :class="{ 'ring-success/25 ring-2': props.state === 'saved' }"
    :title="t('dms.save_bar.instant_hint')"
    :data-state="props.state"
    data-instant-save-badge
  >
    <UIcon
      :name="ICONS[props.state]"
      class="size-3.5 shrink-0"
      :class="{ 'animate-spin': props.state === 'saving' }"
    />
    {{ t("dms.save_bar.instant") }}
  </span>
</template>
