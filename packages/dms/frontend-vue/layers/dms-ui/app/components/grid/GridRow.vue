<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";
import { GRID_DEFAULT_MIN_COLUMN_WIDTH, gridColumnsTemplate } from "./columns";

interface GridRowProps extends DefaultComponentProps {}

const DEFAULT_GAP = "1rem";

const props = defineProps<GridRowProps>();

const gridContext = inject<GridContext>(GRID_CONTEXT);

const columnCount = props.childCount || 0;
if (gridContext) {
  gridContext.registerRowColumnCount(columnCount);
}

const rowStyle = computed(() => {
  const gap = gridContext?.gap.value ?? DEFAULT_GAP;
  return {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: gridColumnsTemplate(
      gridContext?.maxColumns.value || 1,
      gap,
      gridContext?.minColumnWidth.value ?? GRID_DEFAULT_MIN_COLUMN_WIDTH,
    ),
    gap,
  };
});
</script>

<template>
  <div :style="rowStyle" class="dms-grid-row">
    <slot />
  </div>
</template>
