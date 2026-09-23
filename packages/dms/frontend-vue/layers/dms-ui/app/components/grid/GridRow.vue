<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";
import { GRID_DEFAULT_MIN_COLUMN_WIDTH, gridColumnsTemplate } from "./columns";

interface GridRowProps extends DefaultComponentProps {}

const DEFAULT_GAP = "1rem";

const props = defineProps<GridRowProps>();

const gridContext = inject<GridContext>(GRID_CONTEXT);

/** The identity this row counts under, so its width dies with it. */
const rowId = Symbol("grid-row");

const columnCount = computed(() => props.childCount || 0);

watchEffect(() => gridContext?.setRowColumnCount(rowId, columnCount.value));
onUnmounted(() => gridContext?.dropRow(rowId));

/**
 * A row divides its own width among its own children rather than the widest
 * row's: sharing one column count leaves a row holding fewer of them with the
 * remainder blank, which reads as a broken layout and not as an alignment.
 * A child still widens itself across several of these with `colSpan`, and the
 * row still drops columns as the container narrows.
 */
const rowStyle = computed(() => {
  const gap = gridContext?.gap.value ?? DEFAULT_GAP;
  return {
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: gridColumnsTemplate(
      columnCount.value,
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
