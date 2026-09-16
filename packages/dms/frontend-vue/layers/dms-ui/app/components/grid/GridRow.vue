<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";

interface GridRowProps extends DefaultComponentProps {}

const props = defineProps<GridRowProps>();

const gridContext = inject<GridContext>(GRID_CONTEXT);

const columnCount = props.childCount || 0;
if (gridContext) {
  gridContext.registerRowColumnCount(columnCount);
}

const rowStyle = computed(() => ({
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: `repeat(${gridContext?.maxColumns.value || 1}, 1fr)`,
  gap: gridContext?.gap.value ?? "1rem",
}));
</script>

<template>
  <div :style="rowStyle" class="dms-grid-row">
    <slot />
  </div>
</template>
