<script setup lang="ts">
import { useId } from "vue";
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import {
  GRID_CONTEXT,
  GRID_DECLARED_COLUMNS,
  type GridContext,
  type GridDeclaredColumns,
} from "./constants";
import {
  GRID_DEFAULT_MIN_COLUMN_WIDTH,
  gridColumnsTemplate,
  gridResponsiveStyles,
  gridScopeId,
  GridResponsiveStyle,
} from "./columns";
import DmsEmptyStateBlock from "../blocks/EmptyStateBlock.vue";
import {
  type EmptyWhenOptions,
  useEmptyWhen,
} from "../../build/composables/blocks/useEmptyWhen";

interface GridProps extends DefaultComponentProps {
  gap?: string;
  minColumnWidth?: string;
  /**
   * A route whose answer, when the value it names is empty, swaps the rows
   * for one empty state across the grid (interface-dms `GridEmptyWhen`).
   */
  emptyWhen?: EmptyWhenOptions;
}

const props = withDefaults(defineProps<GridProps>(), {
  gap: "1rem",
  minColumnWidth: GRID_DEFAULT_MIN_COLUMN_WIDTH,
  emptyWhen: undefined,
});

const emptyState = useEmptyWhen(
  () => props.emptyWhen,
  () => props.routeParams,
);

/**
 * Keyed by row rather than appended to: a list that only grows keeps counting
 * rows that have gone and widths that were never asked for, so the grid ends up
 * reserving columns nothing fills.
 */
const rowColumnCounts = ref(new Map<symbol, number>());

// The widest row the layout declares for this grid, known from the first
// render (only when the declaration is this grid's own, not an ancestor's).
const declared = inject<GridDeclaredColumns | null>(
  GRID_DECLARED_COLUMNS,
  null,
);
const declaredColumns = computed(() =>
  declared && declared.componentId === props.componentId
    ? declared.columns.value
    : 0,
);

const maxColumns = computed(() => {
  const counts = [...rowColumnCounts.value.values(), declaredColumns.value];
  return Math.max(1, ...counts);
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

// The grid is a size container: its responsive rules (spacers, clamped spans)
// are container queries, identical in the server render and the browser.
const scope = gridScopeId(props.componentId || useId());
const responsiveStyles = computed(() =>
  gridResponsiveStyles(
    scope,
    maxColumns.value,
    props.gap,
    props.minColumnWidth,
  ),
);

const gridStyle = computed(() => ({
  display: "grid",
  gridTemplateColumns: columnsTemplate.value,
  gap: props.gap,
  width: "100%",
  containerType: "inline-size",
  containerName: scope,
}));
</script>

<template>
  <div :style="gridStyle" :data-dms-grid="scope">
    <DmsEmptyStateBlock
      v-if="emptyState"
      v-bind="emptyState"
      class="col-[1/-1]"
    />
    <slot v-else />
    <GridResponsiveStyle :css="responsiveStyles" />
  </div>
</template>
