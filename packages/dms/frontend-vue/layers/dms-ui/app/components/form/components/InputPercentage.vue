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
    // The wrapper takes the caller's class, so the field fills it.
    class: "w-full",
    ui: { ...props.ui, base: ["pe-7", props.ui?.base] },
  };
});
</script>

<template>
  <div class="relative inline-flex" :class="props.class">
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
