<script setup lang="ts">
interface ScalePreviewProps {
  scale: InterfaceScale;
}

interface ScaleBarsConfig {
  count: number;
  barClass: string;
  gapClass: string;
}

const SCALE_BARS: Record<InterfaceScale, ScaleBarsConfig> = {
  small: { count: 6, barClass: "h-[3px]", gapClass: "gap-[5px]" },
  normal: { count: 4, barClass: "h-[5px]", gapClass: "gap-[5px]" },
  large: { count: 3, barClass: "h-2", gapClass: "gap-[9px]" },
};

const BAR_WIDTH_BASE = 50;
const BAR_WIDTH_STEP = 37;
const BAR_WIDTH_RANGE = 45;

const props = defineProps<ScalePreviewProps>();

const bars = computed(() => SCALE_BARS[props.scale]);

const barWidth = (index: number) =>
  `${BAR_WIDTH_BASE + ((index * BAR_WIDTH_STEP) % BAR_WIDTH_RANGE)}%`;
</script>

<template>
  <div
    class="bg-muted flex flex-col justify-center px-4 py-4"
    :class="bars.gapClass"
  >
    <div
      v-for="index in bars.count"
      :key="`scale-bar-${index}`"
      class="rounded-full"
      :class="[bars.barClass, index === 1 ? 'bg-primary' : 'bg-accented']"
      :style="{ width: barWidth(index - 1) }"
    />
  </div>
</template>
