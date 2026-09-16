<script setup lang="ts">
import type { InputProps } from "@nuxt/ui/components/Input.vue";

interface InputTimeProps extends Omit<InputProps, "modelValue" | "type"> {
  modelValue?: number;
  min?: number;
  max?: number;
}

const props = defineProps<InputTimeProps>();
const emits = defineEmits<{
  "update:modelValue": [value: number];
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
    const parsed = parseTimeSpan(displayValue.value);
    if (props.min !== undefined && parsed < props.min) {
      emits("update:modelValue", props.min);
    } else if (props.max !== undefined && parsed > props.max) {
      emits("update:modelValue", props.max);
    } else {
      emits("update:modelValue", parsed);
    }
  } else {
    emits("update:modelValue", 0);
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
