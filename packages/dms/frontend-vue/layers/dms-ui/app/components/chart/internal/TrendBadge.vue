<script setup lang="ts">
import { computed } from "vue";
import { formatDeltaPercent } from "../../../composables/chart/formatValue";

interface Props {
  delta: number | null | undefined;
  invert?: boolean;
  suffix?: string;
}

const props = defineProps<Props>();

const POSITIVE_CLASSES = "bg-success/10 text-success";
const NEGATIVE_CLASSES = "bg-error/10 text-error";
const NEUTRAL_CLASSES = "bg-elevated text-muted";
const ICON_UP = "i-lucide-trending-up";
const ICON_DOWN = "i-lucide-trending-down";
const ICON_FLAT = "i-lucide-minus";
const EMPTY_DISPLAY = "—";

const { locale } = useI18n();

const isPositive = computed(() => {
  if (props.delta === null || props.delta === undefined) return null;
  if (props.delta === 0) return null;
  const positive = props.delta > 0;
  return props.invert ? !positive : positive;
});

const colorClass = computed(() => {
  if (isPositive.value === null) return NEUTRAL_CLASSES;
  return isPositive.value ? POSITIVE_CLASSES : NEGATIVE_CLASSES;
});

const icon = computed(() => {
  if (props.delta === null || props.delta === undefined || props.delta === 0) {
    return ICON_FLAT;
  }
  return props.delta > 0 ? ICON_UP : ICON_DOWN;
});

const display = computed(() => {
  if (props.delta === null || props.delta === undefined) return EMPTY_DISPLAY;
  const percent = formatDeltaPercent(props.delta, locale.value);
  return `${percent}${props.suffix ?? ""}`;
});
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums transition-colors"
    :class="colorClass"
  >
    <UIcon :name="icon" class="size-3" aria-hidden="true" />
    {{ display }}
  </span>
</template>
