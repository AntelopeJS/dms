<script setup lang="ts">
import type {
  CheckboxProps,
  CheckboxEmits,
  CheckboxSlots,
} from "@nuxt/ui/components/Checkbox.vue";
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<CheckboxProps>();
const emits = defineEmits<CheckboxEmits>();
defineSlots<CheckboxSlots>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <UCheckbox v-bind="forwarded" />
</template>
