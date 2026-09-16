<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";

interface GridProps extends DefaultComponentProps {
  gap?: string;
}

const props = withDefaults(defineProps<GridProps>(), {
  gap: "1rem",
});

const rowColumnCounts = ref<number[]>([]);

const maxColumns = computed(() => {
  if (rowColumnCounts.value.length === 0) return 1;
  return Math.max(...rowColumnCounts.value);
});

const gapRef = computed(() => props.gap);

provide<GridContext>(GRID_CONTEXT, {
  registerRowColumnCount: (columnCount: number) => {
    rowColumnCounts.value.push(columnCount);
  },
  maxColumns,
  gap: gapRef,
});

const gridStyle = computed(() => ({
  display: "grid",
  gridTemplateColumns: `repeat(${maxColumns.value}, 1fr)`,
  gap: props.gap,
  width: "100%",
}));
</script>

<template>
  <div :style="gridStyle">
    <slot />
  </div>
</template>
