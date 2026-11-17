<script setup lang="ts">
import type { SliderProps, SliderEmits } from "@nuxt/ui/components/Slider.vue";
import { useForwardPropsEmits } from "reka-ui";

const props = defineProps<SliderProps>();
const emits = defineEmits<SliderEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <USlider v-bind="forwarded" />
</template>
