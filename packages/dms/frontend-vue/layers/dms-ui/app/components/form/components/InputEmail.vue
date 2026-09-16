<script setup lang="ts">
import type { InputProps, InputEmits, InputSlots } from "@nuxt/ui";
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<InputProps>();
const emits = defineEmits<InputEmits>();
defineSlots<InputSlots>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <UInput v-bind="forwarded" leading leading-icon="i-ph-envelope" />
</template>
