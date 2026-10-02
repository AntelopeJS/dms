<script setup lang="ts">
import type {
  InputNumberProps,
  InputNumberEmits,
  InputNumberSlots,
} from "@nuxt/ui/components/InputNumber.vue";
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<InputNumberProps>();
const emits = defineEmits<InputNumberEmits>();
defineSlots<InputNumberSlots>();

const forwarded = useForwardPropsEmits(props, emits);

// v2 number fields keep the value left-aligned with a compact caret stepper.
const DEFAULT_ORIENTATION = "vertical";
</script>

<template>
  <UInputNumber
    v-bind="forwarded"
    :orientation="props.orientation ?? DEFAULT_ORIENTATION"
    :increment="{ color: 'neutral' }"
    :decrement="{ color: 'neutral' }"
  />
</template>
