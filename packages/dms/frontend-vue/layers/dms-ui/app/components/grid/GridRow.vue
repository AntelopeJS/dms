<script setup lang="ts">
import type { DefaultComponentProps } from "../../../../dms-core/app/types/component";
import { GRID_CONTEXT, type GridContext } from "./constants";
import { GRID_DEFAULT_MIN_COLUMN_WIDTH, gridColumnsTemplate } from "./columns";
import { GRID_TRACKS_VAR, useGridTrackCount } from "./trackCount";

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
const columnsTemplate = computed(() =>
  gridColumnsTemplate(
    gridContext?.maxColumns.value || 1,
    gap.value,
    gridContext?.minColumnWidth.value ?? GRID_DEFAULT_MIN_COLUMN_WIDTH,
  ),
);
const rowRef = ref<HTMLElement | null>(null);
const trackCount = useGridTrackCount(rowRef, () => ({
  maxColumns: gridContext?.maxColumns.value || 1,
  minColumnWidth:
    gridContext?.minColumnWidth.value ?? GRID_DEFAULT_MIN_COLUMN_WIDTH,
}));

// Fewer tracks than the widest row asks for: spacers stop holding cells.
const isReflowed = computed(
  () =>
    trackCount.value !== undefined &&
    trackCount.value < (gridContext?.maxColumns.value || 1),
);

const rowStyle = computed(() => ({
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: columnsTemplate.value,
  gap: gap.value,
  [GRID_TRACKS_VAR]: trackCount.value?.toString(),
}));
</script>

<template>
  <!-- min-w-0: a cell holds its track, so long content truncates instead of
       widening the cell past a narrow screen. -->
  <div
    ref="rowRef"
    :style="rowStyle"
    :data-dms-grid-reflowed="isReflowed || undefined"
    class="dms-grid-row *:min-w-0"
  >
    <slot />
  </div>
</template>
