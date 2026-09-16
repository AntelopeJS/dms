<script lang="ts" setup>
import {
  alignmentMap,
  distributionMap,
} from "../../composables/layout/stack-types";

interface VStackProps {
  alignment?: StackAlignment;
  distribution?: StackDistribution;
  spacing?: string;
}

const props = withDefaults(defineProps<VStackProps>(), {
  alignment: "center",
  distribution: "start",
  spacing: "8px",
});
</script>

<template>
  <div
    :style="{
      display: 'flex',
      flexDirection: 'column',
      alignItems: alignmentMap[props.alignment],
      justifyContent: distributionMap[props.distribution],
      gap: props.spacing,
    }"
    class="w-full"
  >
    <slot />
  </div>
</template>
