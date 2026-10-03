<script setup lang="ts">
import { useId } from "vue";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";
import {
  GRID_DEFAULT_MIN_COLUMN_WIDTH,
  gridColumnsTemplate,
  gridResponsiveStyles,
  gridScopeId,
  GridResponsiveStyle,
} from "./columns";

interface GridRowProps extends DefaultComponentProps {}

const DEFAULT_GAP = "1rem";

const props = defineProps<GridRowProps>();

const gridContext = inject<GridContext>(GRID_CONTEXT);

/** The identity this row counts under, so its width dies with it. */
const rowId = Symbol("grid-row");

const columnCount = computed(() => props.childCount || 0);

watchEffect(() => gridContext?.setRowColumnCount(rowId, columnCount.value));
onUnmounted(() => gridContext?.dropRow(rowId));

const gap = computed(() => gridContext?.gap.value ?? DEFAULT_GAP);
const maxColumns = computed(() => gridContext?.maxColumns.value || 1);
const minColumnWidth = computed(
  () => gridContext?.minColumnWidth.value ?? GRID_DEFAULT_MIN_COLUMN_WIDTH,
);
const columnsTemplate = computed(() =>
  gridColumnsTemplate(maxColumns.value, gap.value, minColumnWidth.value),
);

// The row is a size container: whether its spacers hold a cell and how far
// its spans reach are container queries on its own width, identical in the
// server render and the browser (see gridResponsiveStyles).
const scope = gridScopeId(props.componentId || useId());
const responsiveStyles = computed(() =>
  gridResponsiveStyles(
    scope,
    maxColumns.value,
    gap.value,
    minColumnWidth.value,
  ),
);

const rowStyle = computed(() => ({
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: columnsTemplate.value,
  gap: gap.value,
  containerType: "inline-size",
  containerName: scope,
}));
</script>

<template>
  <!-- min-w-0: a cell holds its track, so long content truncates instead of
       widening the cell past a narrow screen. -->
  <div :style="rowStyle" :data-dms-grid="scope" class="dms-grid-row *:min-w-0">
    <slot />
    <GridResponsiveStyle :css="responsiveStyles" />
  </div>
</template>
