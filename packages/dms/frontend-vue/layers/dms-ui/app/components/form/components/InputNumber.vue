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
</script>

<template>
  <UInputNumber
    v-bind="forwarded"
    :increment="{ color: 'neutral' }"
    :decrement="{ color: 'neutral' }"
  />
</template>
