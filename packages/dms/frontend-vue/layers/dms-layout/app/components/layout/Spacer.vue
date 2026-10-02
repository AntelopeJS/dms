<script lang="ts" setup>
interface SpacerProps {
  minSize?: string;
  maxSize?: string;
  grow?: number;
}

const props = withDefaults(defineProps<SpacerProps>(), {
  minSize: undefined,
  maxSize: undefined,
  grow: 1,
});
</script>

<template>
  <div
    :style="{
      flexGrow: props.grow,
      flexShrink: 1,
      flexBasis: 'auto',
      minWidth: props.minSize,
      maxWidth: props.maxSize,
      minHeight: props.minSize,
      maxHeight: props.maxSize,
    }"
    class="dms-spacer"
  />
</template>

<style>
/* A spacer adds only the free space it takes, never an extra gap: a stack's
   gap would otherwise open on both sides of it, doubling the distance between
   its neighbours whenever there is no free space to fill. */
.dms-vstack > .dms-spacer:not(:first-child) {
  margin-block-start: calc(-1 * var(--dms-stack-gap, 0px));
}
.dms-vstack > .dms-spacer:first-child {
  margin-block-end: calc(-1 * var(--dms-stack-gap, 0px));
}
.dms-hstack > .dms-spacer:not(:first-child) {
  margin-inline-start: calc(-1 * var(--dms-stack-gap, 0px));
}
.dms-hstack > .dms-spacer:first-child {
  margin-inline-end: calc(-1 * var(--dms-stack-gap, 0px));
}

/* In a grid, a spacer holds a cell to line the next ones up with the columns.
   Once the grid has fewer tracks than its widest row (a phone keeps one),
   there is no column to line up with: the empty cell would only take a row of
   its own, and a second gap. The grid flags that state (Grid / GridRow). */
[data-dms-grid-reflowed] > .dms-spacer,
[data-dms-grid-reflowed] > :has(> .dms-spacer) {
  display: none;
}
</style>
