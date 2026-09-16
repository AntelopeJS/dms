<script setup lang="ts">
import type {
  TextareaProps,
  TextareaEmits,
  TextareaSlots,
} from "@nuxt/ui/components/Textarea.vue";
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<TextareaProps>();
const emits = defineEmits<TextareaEmits>();
defineSlots<TextareaSlots>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <UTextarea v-bind="forwarded" />
</template>
