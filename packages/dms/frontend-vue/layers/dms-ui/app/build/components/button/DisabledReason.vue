<script setup lang="ts">
import type { Slot } from "vue";

interface DisabledReasonProps {
  /**
   * Why the wrapped button is disabled, shown in a tooltip on a focusable
   * wrapper: a disabled button fires no pointer event, and the wrapper also
   * brings the reason to keyboard users. Without one the button is drawn alone.
   */
  reason?: string;
}

interface DisabledReasonSlots {
  /** The disabled button. */
  default?: () => ReturnType<Slot>;
}

const props = defineProps<DisabledReasonProps>();
defineSlots<DisabledReasonSlots>();
</script>

<template>
  <UTooltip v-if="props.reason" :text="props.reason">
    <span tabindex="0" class="inline-flex"><slot /></span>
  </UTooltip>
  <slot v-else />
</template>
