<script setup lang="ts">
import { computed } from "vue";
import DmsFieldError from "#dms-ui/app/components/field-error/FieldError.vue";
import { fieldErrorId } from "#dms-core/app/composables/useFieldErrors";

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

const errorId = computed(() => fieldErrorId(props.fieldId));
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
    <DmsFieldError :id="errorId" :message="props.error" />
    <slot name="after" />
  </div>
</template>
