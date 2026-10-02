<script setup lang="ts">
import { computed } from "vue";

interface SecurityPanelFieldProps {
  /** Id of the control the label points to. */
  fieldId: string;
  /** Label above the control. */
  label: string;
  /** Inline error under the control; also marks the control invalid. */
  error?: string;
  /** Own row, half width (the current password above the new values). */
  alone?: boolean;
}

interface SecurityPanelFieldSlots {
  /** The control; bind `describedby` and `invalid` onto it. */
  default?: (props: {
    describedby: string | undefined;
    invalid: boolean;
  }) => unknown;
  /** Under the control and its error (a "Forgot your password?" link). */
  after?: () => unknown;
}

const props = withDefaults(defineProps<SecurityPanelFieldProps>(), {
  error: undefined,
  alone: false,
});
defineSlots<SecurityPanelFieldSlots>();

const errorId = computed(() => `${props.fieldId}-error`);
</script>

<template>
  <div
    class="grid content-start gap-1.5"
    :class="
      props.alone && 'col-span-full max-w-[calc(50%-10px)] max-sm:max-w-none'
    "
  >
    <label
      :for="props.fieldId"
      class="text-highlighted text-[13px] font-medium"
    >
      {{ props.label }}
    </label>
    <slot
      :describedby="props.error ? errorId : undefined"
      :invalid="!!props.error"
    />
    <span v-if="props.error" :id="errorId" class="text-error text-xs">
      {{ props.error }}
    </span>
    <slot name="after" />
  </div>
</template>
