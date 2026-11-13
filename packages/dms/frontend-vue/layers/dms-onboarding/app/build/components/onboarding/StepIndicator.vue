<script setup lang="ts">
import type { StepperItem } from "@nuxt/ui";

interface StepIndicatorProps {
  labels: string[];
  /** Index of the current step. */
  current: number;
  /** Accessible name of the step list. */
  stepsLabel: string;
}

const DONE_ICON = "i-ph-check-bold";
const OTHER_STEP_UI: NonNullable<StepperItem["ui"]> = {
  item: undefined,
  container: undefined,
  trigger: undefined,
  indicator: undefined,
  icon: undefined,
  separator: undefined,
  wrapper: "max-sm:hidden",
  title: undefined,
  description: undefined,
};

const props = defineProps<StepIndicatorProps>();

const items = computed<StepperItem[]>(() =>
  props.labels.map((label, index) => ({
    title: label,
    icon: index < props.current ? DONE_ICON : undefined,
    ui: index !== props.current ? OTHER_STEP_UI : undefined,
  })),
);
</script>

<template>
  <!-- v2 .au-steps through the themed UStepper (theme/navigation.ts, size
       sm): done = accent fill with a check, current = accent ring with a
       halo, upcoming = hairline. Read-only: the page drives the step. -->
  <UStepper
    :items="items"
    :model-value="props.current"
    :aria-label="props.stepsLabel"
    size="sm"
    disabled
    :ui="{ header: 'justify-center' }"
  />
</template>
