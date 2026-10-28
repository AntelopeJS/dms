<script setup lang="ts">
import { useId } from "vue";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";
import {
  GRID_DEFAULT_MIN_COLUMN_WIDTH,
  gridCollapsedCellStyles,
  gridColumnsTemplate,
  gridResponsiveStyles,
  gridScopeId,
  GridResponsiveStyle,
} from "./columns";

interface GridRowProps extends DefaultComponentProps {}

const DEFAULT_GAP = "1rem";

const props = defineProps<GridRowProps>();

const gridContext = inject<GridContext | null>(GRID_CONTEXT, null);

provide<GridContext | null>(GRID_CONTEXT, null);

/** The identity this row counts under, so its width dies with it. */
const rowId = Symbol("grid-row");

const columnCount = computed(() => props.childCount || 0);

watchEffect(() => gridContext?.setRowColumnCount(rowId, columnCount.value));
onUnmounted(() => gridContext?.dropRow(rowId));

const gap = computed(() => gridContext?.gap.value ?? DEFAULT_GAP);

const maxColumns = computed(() =>
  Math.max(1, gridContext ? gridContext.maxColumns.value : columnCount.value),
);
const minColumnWidth = computed(
  () => gridContext?.minColumnWidth.value ?? GRID_DEFAULT_MIN_COLUMN_WIDTH,
);
const columnsTemplate = computed(() =>
  gridColumnsTemplate(maxColumns.value, gap.value, minColumnWidth.value),
);

const scope = gridScopeId(props.componentId || useId());

const responsiveStyles = computed(() =>
  [
    gridCollapsedCellStyles(scope, maxColumns.value),
    gridResponsiveStyles(
      scope,
      maxColumns.value,
      gap.value,
      minColumnWidth.value,
    ),
  ]
    .filter(Boolean)
    .join("\n"),
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
