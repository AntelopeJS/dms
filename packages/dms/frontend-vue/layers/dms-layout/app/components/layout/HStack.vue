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
  grow?: number;
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
      '--dms-stack-gap': props.spacing,
      flexGrow: props.grow,
      flexWrap: props.wrap ? 'wrap' : 'nowrap',
    }"
    class="dms-hstack w-full"
  >
    <slot />
  </div>
</template>

<style>
/* A stack fills what holds it, except along a row, where it is one item among
   its siblings: sibling stacks share the row (in their `grow` ratio), and in
   a row with a Spacer they keep their content width so the Spacer can push
   them aside. An inline `grow` wins over both. */
.dms-hstack > :is(.dms-hstack, .dms-vstack) {
  width: auto;
  flex: 1 1 0%;
}
.dms-hstack:has(> .dms-spacer) > :is(.dms-hstack, .dms-vstack) {
  flex: 0 1 auto;
}
</style>
