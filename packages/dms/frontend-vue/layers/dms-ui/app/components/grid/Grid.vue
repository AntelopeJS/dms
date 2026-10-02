<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";
import { GRID_DEFAULT_MIN_COLUMN_WIDTH, gridColumnsTemplate } from "./columns";
import { GRID_TRACKS_VAR, useGridTrackCount } from "./trackCount";

interface GridProps extends DefaultComponentProps {
  gap?: string;
  minColumnWidth?: string;
}

const props = withDefaults(defineProps<GridProps>(), {
  gap: "1rem",
  minColumnWidth: GRID_DEFAULT_MIN_COLUMN_WIDTH,
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
const minColumnWidthRef = computed(() => props.minColumnWidth);

provide<GridContext>(GRID_CONTEXT, {
  setRowColumnCount: (row: symbol, columnCount: number) => {
    rowColumnCounts.value.set(row, columnCount);
  },
  dropRow: (row: symbol) => {
    rowColumnCounts.value.delete(row);
  },
  maxColumns,
  gap: gapRef,
  minColumnWidth: minColumnWidthRef,
});

const columnsTemplate = computed(() =>
  gridColumnsTemplate(maxColumns.value, props.gap, props.minColumnWidth),
);
const gridRef = ref<HTMLElement | null>(null);
const trackCount = useGridTrackCount(gridRef, () => ({
  maxColumns: maxColumns.value,
  minColumnWidth: props.minColumnWidth,
}));

// Fewer tracks than the widest row asks for: spacers stop holding cells.
const isReflowed = computed(
  () => trackCount.value !== undefined && trackCount.value < maxColumns.value,
);

const gridStyle = computed(() => ({
  display: "grid",
  gridTemplateColumns: columnsTemplate.value,
  gap: props.gap,
  width: "100%",
  [GRID_TRACKS_VAR]: trackCount.value?.toString(),
}));
</script>

<template>
  <div
    ref="gridRef"
    :style="gridStyle"
    :data-dms-grid-reflowed="isReflowed || undefined"
  >
    <slot />
  </div>
</template>
