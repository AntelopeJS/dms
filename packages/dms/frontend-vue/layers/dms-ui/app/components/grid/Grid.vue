<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";

interface GridProps extends DefaultComponentProps {
  gap?: string;
}

const props = withDefaults(defineProps<GridProps>(), {
  gap: "1rem",
});

/**
 * Keyed by row rather than appended to: a list that only grows keeps counting
 * rows that have gone and widths that were never asked for, so the grid ends up
 * reserving columns nothing fills.
 */
const rowColumnCounts = ref(new Map<symbol, number>());

const maxColumns = computed(() => {
  const counts = [...rowColumnCounts.value.values()].filter(
    (count) => count > 0,
  );
  return counts.length === 0 ? 1 : Math.max(...counts);
});

const gapRef = computed(() => props.gap);

provide<GridContext>(GRID_CONTEXT, {
  setRowColumnCount: (row: symbol, columnCount: number) => {
    rowColumnCounts.value.set(row, columnCount);
  },
  dropRow: (row: symbol) => {
    rowColumnCounts.value.delete(row);
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
