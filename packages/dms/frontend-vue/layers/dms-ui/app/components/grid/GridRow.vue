<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";

interface GridRowProps extends DefaultComponentProps {}

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
 * A child still widens itself across several of these with `colSpan`.
 */
const rowStyle = computed(() => ({
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: `repeat(${Math.max(columnCount.value, 1)}, 1fr)`,
  gap: gridContext?.gap.value ?? "1rem",
}));
</script>

<template>
  <div :style="rowStyle" class="dms-grid-row">
    <slot />
  </div>
</template>
