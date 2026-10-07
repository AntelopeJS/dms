<script setup lang="ts">
import type { InputProps } from "@nuxt/ui/components/Input.vue";
import { useControlError } from "../../../build/composables/form/useControlError";

interface InputTimeProps extends Omit<InputProps, "modelValue" | "type"> {
  modelValue?: number | null;
  min?: number;
  max?: number;
}

const props = defineProps<InputTimeProps>();
const { report } = useControlError();
const UNREADABLE_DURATION = "$dms.field_errors.invalid_duration";
const emits = defineEmits<{
  "update:modelValue": [value: number | null];
}>();

const displayValue = ref("");
const isUserTyping = ref(false);

const updateDisplayValue = () => {
  if (isUserTyping.value) return;
  if (props.modelValue !== undefined && props.modelValue !== null) {
    displayValue.value = formatTimeSpan(props.modelValue);
  } else {
    displayValue.value = "";
  }
};

watch(() => props.modelValue, updateDisplayValue, { immediate: true });

const handleInput = (value: string | number | bigint | boolean | null) => {
  isUserTyping.value = true;
  displayValue.value = String(value ?? "");
};

const handleBlur = () => {
  isUserTyping.value = false;
  if (displayValue.value) {
    const parsed = readTimeSpan(displayValue.value);
    // An unreadable duration is no duration: kept on screen for its author
    // to fix, and refused by the form until then.
    report(parsed === undefined ? UNREADABLE_DURATION : undefined);
    if (parsed === undefined) {
      emits("update:modelValue", null);
      return;
    }
    if (props.min !== undefined && parsed < props.min) {
      emits("update:modelValue", props.min);
    } else if (props.max !== undefined && parsed > props.max) {
      emits("update:modelValue", props.max);
    } else {
      emits("update:modelValue", parsed);
    }
  } else {
    // A cleared time is no time, not midnight: a required one stays missing.
    report(undefined);
    emits("update:modelValue", null);
  }
  updateDisplayValue();
};

const forwardedProps = computed(() => {
  const { modelValue: _, min: __, max: ___, ...rest } = props;
  return rest;
});
</script>

<template>
  <UInput
    v-bind="forwardedProps"
    :model-value="displayValue"
    @update:model-value="handleInput"
    @blur="handleBlur"
  />
</template>
