<script setup lang="ts">
import type {
  InputNumberProps,
  InputNumberEmits,
  InputNumberSlots,
} from "@nuxt/ui";
import { computed } from "vue";
import {
  type InputWidth,
  isCompactNumberInput,
} from "../../../build/utils/inputWidth";

interface InputPercentageProps extends InputNumberProps {
  /** As on `InputNumber`; left out, the 0-100 bounds make it compact. */
  width?: InputWidth;
}

const PERCENTAGE_MULTIPLIER = 100;

const props = defineProps<InputPercentageProps>();
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

const bounds = computed(() => ({
  min: props.min ?? 0,
  max: props.max ?? PERCENTAGE_MULTIPLIER,
}));
const isCompact = computed(() =>
  isCompactNumberInput({ width: props.width, ...bounds.value }),
);

const forwardedProps = computed(() => {
  const { width: _width, ...rest } = props;
  return {
    ...rest,
    ...bounds.value,
    modelValue: displayValue.value,
    step: props.step ?? 0.01,
    // The wrapper takes the caller's class, so the field fills it.
    class: "w-full",
    ui: { ...props.ui, base: ["pe-7", props.ui?.base] },
  };
});
</script>

<template>
  <div
    class="relative inline-flex"
    :class="[props.class, isCompact && 'sm:max-w-44']"
  >
    <UInputNumber
      v-bind="forwardedProps"
      @update:model-value="displayValue = $event"
    />
    <!-- UInputNumber has no trailing slot. -->
    <span
      class="text-dimmed pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-[13px]"
      aria-hidden="true"
    >
      %
    </span>
  </div>
</template>
