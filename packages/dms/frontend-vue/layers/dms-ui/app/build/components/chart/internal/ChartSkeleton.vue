<script setup lang="ts">
/**
 * The chart-shaped placeholder of a chart that is not drawn yet: ghost
 * columns on a baseline for an axis chart, a ring for a circular one. It
 * takes the exact frame height of the drawn chart, so the swap moves nothing.
 */
interface ChartSkeletonProps {
  /** Frame height of the drawn chart, as a CSS length. */
  height: string;
  /** Donut, pie or radial bar: a ring instead of columns. */
  circular?: boolean;
}

const props = withDefaults(defineProps<ChartSkeletonProps>(), {
  circular: false,
});

// Ghost columns at plot height, rising like a series would (heights in %).
const GHOST_BAR_HEIGHTS = [38, 52, 46, 64, 58, 72, 66, 80, 74, 88, 70, 92];
const PERCENT_UNIT = "%";
// The ring spans most of the frame, like Apex sizes a donut to its box.
const RING_SIZE = "min(78%, 16rem)";
const RING_HOLE_MASK =
  "radial-gradient(circle, transparent 54%, #000 calc(54% + 1px))";
</script>

<template>
  <div
    v-if="props.circular"
    class="grid place-items-center"
    :style="{ height: props.height }"
    aria-busy="true"
  >
    <USkeleton
      class="aspect-square rounded-full"
      :style="{
        height: RING_SIZE,
        maskImage: RING_HOLE_MASK,
        WebkitMaskImage: RING_HOLE_MASK,
      }"
    />
  </div>
  <div
    v-else
    class="flex items-end gap-2.5 border-b border-(--dms-chart-grid) px-1.5"
    :style="{ height: props.height }"
    aria-busy="true"
  >
    <USkeleton
      v-for="(barHeight, index) in GHOST_BAR_HEIGHTS"
      :key="index"
      class="flex-1 rounded-t-[4px] rounded-b-none"
      :style="{ height: `${barHeight}${PERCENT_UNIT}` }"
    />
  </div>
</template>
