<script setup lang="ts">
import type {
  SwitchProps,
  SwitchEmits,
  SwitchSlots,
} from "@nuxt/ui/components/Switch.vue";
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<SwitchProps>();
const emits = defineEmits<SwitchEmits>();
defineSlots<SwitchSlots>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <USwitch v-bind="forwarded" />
</template>
