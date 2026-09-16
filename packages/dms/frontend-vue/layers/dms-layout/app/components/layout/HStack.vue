<script lang="ts" setup>
import {
  alignmentMap,
  distributionMap,
} from "../../composables/layout/stack-types";

interface HStackProps {
  alignment?: StackAlignment;
  distribution?: StackDistribution;
  spacing?: string;
  wrap?: boolean;
}

const props = withDefaults(defineProps<HStackProps>(), {
  alignment: "center",
  distribution: "start",
  spacing: "8px",
  wrap: false,
});
</script>

<template>
  <div
    :style="{
      display: 'flex',
      flexDirection: 'row',
      alignItems: alignmentMap[props.alignment],
      justifyContent: distributionMap[props.distribution],
      gap: props.spacing,
      flexWrap: props.wrap ? 'wrap' : 'nowrap',
    }"
    class="w-full"
  >
    <slot />
  </div>
</template>
