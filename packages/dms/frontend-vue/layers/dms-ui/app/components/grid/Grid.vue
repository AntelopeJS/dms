<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";
import { GRID_DEFAULT_MIN_COLUMN_WIDTH, gridColumnsTemplate } from "./columns";

interface GridProps extends DefaultComponentProps {
  gap?: string;
  minColumnWidth?: string;
}

const props = withDefaults(defineProps<GridProps>(), {
  gap: "1rem",
  minColumnWidth: GRID_DEFAULT_MIN_COLUMN_WIDTH,
});

const rowColumnCounts = ref<number[]>([]);

const maxColumns = computed(() => {
  if (rowColumnCounts.value.length === 0) return 1;
  return Math.max(...rowColumnCounts.value);
});

const gapRef = computed(() => props.gap);
const minColumnWidthRef = computed(() => props.minColumnWidth);

provide<GridContext>(GRID_CONTEXT, {
  registerRowColumnCount: (columnCount: number) => {
    rowColumnCounts.value.push(columnCount);
  },
  maxColumns,
  gap: gapRef,
  minColumnWidth: minColumnWidthRef,
});

const gridStyle = computed(() => ({
  display: "grid",
  gridTemplateColumns: gridColumnsTemplate(
    maxColumns.value,
    props.gap,
    props.minColumnWidth,
  ),
  gap: props.gap,
  width: "100%",
}));
</script>

<template>
  <div :style="gridStyle">
    <slot />
  </div>
</template>
