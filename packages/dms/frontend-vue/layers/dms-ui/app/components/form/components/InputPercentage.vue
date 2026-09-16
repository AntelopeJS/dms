<script setup lang="ts">
import type {
  InputNumberProps,
  InputNumberEmits,
  InputNumberSlots,
} from "@nuxt/ui";

const PERCENTAGE_MULTIPLIER = 100;

const props = defineProps<InputNumberProps>();
const emits = defineEmits<InputNumberEmits>();
defineSlots<InputNumberSlots>();

const displayValue = computed({
  get: () => {
    const value = props.modelValue;
    return isNumber(value) ? value * PERCENTAGE_MULTIPLIER : value;
  },
  set: (newValue) => {
    if (isNumber(newValue)) {
      emits("update:modelValue", newValue / PERCENTAGE_MULTIPLIER);
    } else {
      emits("update:modelValue", newValue as unknown as number);
    }
  },
});

const forwardedProps = computed(() => {
  return {
    ...props,
    modelValue: displayValue.value,
    min: props.min ?? 0,
    max: props.max ?? PERCENTAGE_MULTIPLIER,
    step: props.step ?? 0.01,
  };
});
</script>

<template>
  <UInputNumber
    v-bind="forwardedProps"
    @update:model-value="displayValue = $event"
  >
    <template #trailing>
      <span class="text-dimmed text-sm">%</span>
    </template>
  </UInputNumber>
</template>
