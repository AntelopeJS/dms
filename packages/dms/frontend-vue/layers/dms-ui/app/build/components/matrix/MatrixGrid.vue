<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
import type { MatrixColumn, MatrixRow } from "../../../types/matrix";
import { EYEBROW_CLASS } from "../../utils/eyebrow";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import type { MatrixSection } from "../../composables/matrix/matrixSections";
import {
  columnAlign,
  matrixGridSlots,
} from "../../composables/matrix/matrixLayout";
import { isTotalledColumn } from "../../composables/matrix/matrixTotals";
import { MATRIX_ALIGN_CLASSES } from "../../composables/matrix/matrixTones";
import { matrixFilterParams } from "../../composables/matrix/matrixQuery";
import MatrixCell from "./MatrixCell.vue";
import MatrixGroupHeader from "./MatrixGroupHeader.vue";
import MatrixHeaderCell from "./MatrixHeaderCell.vue";
import MatrixRowHeaderCell from "./MatrixRowHeaderCell.vue";

/**
 * The grid itself (`role="grid"`): a sticky header row, a sticky row header
 * column and pinned columns, the rows under their group headers, a Total
 * column (after the columns it adds up) and a sticky Total row, skeleton
 * rows on a first load, a thin bar while a read runs, and a sentinel: it
 * draws the next rows of a long grid (a batch at a time) and reads the next
 * page of an infinite one.
 */
const matrix = useMatrixContext();
const { t, locale } = useI18n();

const DEFAULT_ROW_HEADER_WIDTH = 200;
const NUMBERS_WIDTH = 36;
const SELECT_WIDTH = 32;
const TOTAL_COLUMN_WIDTH = 112;
const SKELETON_ROWS = 6;
const SCROLL_MARGIN = "400px";
/** Rows drawn at a time in a grid listing every row at once. */
const REVEAL_BATCH = 200;
const ROW_HEIGHTS = { compact: "36px", comfortable: "44px" } as const;
// The header row is row 1.
const FIRST_BODY_ROW_INDEX = 2;

const scroller = useTemplateRef<HTMLElement>("scroller");
const sentinel = useTemplateRef<HTMLElement>("sentinel");
watch(scroller, (element) => {
  matrix.root.value = element;
});

const columns = computed(() => matrix.columns.visible.value);
const hasNumbers = computed(() => matrix.options.rowHeader?.numbers === true);
const isSelectable = computed(() => matrix.options.selectable === true);
const rowHeaderWidth = computed(
  () =>
    (matrix.options.rowHeader?.width ?? DEFAULT_ROW_HEADER_WIDTH) +
    (hasNumbers.value ? NUMBERS_WIDTH : 0) +
    (isSelectable.value ? SELECT_WIDTH : 0),
);
const hasTotalColumn = computed(() => matrix.options.totals?.rows === true);
const hasTotalRow = computed(() => matrix.options.totals?.columns === true);
const totalLabel = computed(
  () => matrix.text(matrix.options.totals?.label) || t("dms.matrix.total"),
);
const rowHeaderLabel = computed(
  () => matrix.text(matrix.options.rowHeader?.label) || "",
);

const slots = computed(() =>
  matrixGridSlots(
    columns.value,
    matrix.columns.widthOf,
    rowHeaderWidth.value,
    hasTotalColumn.value,
  ),
);
const tableWidth = computed(
  () =>
    rowHeaderWidth.value +
    columns.value.reduce(
      (sum, column) => sum + matrix.columns.widthOf(column),
      0,
    ) +
    (hasTotalColumn.value ? TOTAL_COLUMN_WIDTH : 0),
);

/** A group header drawn among the rows, with its `aria-rowindex`. */
interface GridGroupItem {
  type: "group";
  key: string;
  section: MatrixSection;
  index: number;
}

/** A row drawn, with its `aria-rowindex` and its number across pages. */
interface GridRowItem {
  type: "row";
  key: string;
  row: MatrixRow;
  index: number;
  number?: number;
}

type GridItem = GridGroupItem | GridRowItem;

const pageOffset = computed(() =>
  matrix.options.pagination === "pages"
    ? matrix.query.state.value.page * matrix.query.state.value.pageSize
    : 0,
);
const answeredIndex = computed(
  () =>
    new Map(
      (matrix.source.data.value?.rows ?? []).map((row, index) => [
        row.id,
        index,
      ]),
    ),
);

// Thousands of rows listed at once are drawn a batch at a time, the next one
// as the sentinel comes into view, so the grid stays fluid.
const isBatched = computed(
  () => (matrix.options.pagination ?? "none") === "none",
);
const revealed = ref(REVEAL_BATCH);
watch(
  () => JSON.stringify(matrixFilterParams(matrix.query.state.value)),
  () => {
    revealed.value = REVEAL_BATCH;
  },
);
// A row the keyboard or a jump moves to is drawn first.
watch(matrix.interaction.focus, (focus) => {
  if (!focus || !isBatched.value) return;
  const index = matrix.rows.shown.value.findIndex(
    (row) => row.id === focus.rowId,
  );
  if (index >= revealed.value) revealed.value = index + REVEAL_BATCH;
});
const rowLimit = computed(() =>
  isBatched.value ? revealed.value : Number.POSITIVE_INFINITY,
);

const items = computed<GridItem[]>(() => {
  const list: GridItem[] = [];
  let index = FIRST_BODY_ROW_INDEX;
  let drawn = 0;
  for (const section of matrix.rows.sections.value) {
    if (drawn >= rowLimit.value) break;
    if (section.group)
      list.push({
        type: "group",
        key: `g:${section.key}`,
        section,
        index: index++,
      });
    if (section.group && matrix.rows.isCollapsed(section.key)) continue;
    for (const row of section.rows) {
      if (drawn >= rowLimit.value) break;
      drawn++;
      const answered = answeredIndex.value.get(row.id);
      list.push({
        type: "row",
        key: `r:${row.id}`,
        row,
        index: index++,
        number:
          answered === undefined ? undefined : pageOffset.value + answered + 1,
      });
    }
  }
  return list;
});
const hasHiddenRows = computed(
  () => isBatched.value && matrix.rows.shown.value.length > revealed.value,
);
const hasMore = computed(
  () => hasHiddenRows.value || matrix.source.hasMore.value,
);

const groupHeaderCount = computed(
  () => matrix.rows.sections.value.filter((section) => section.group).length,
);
// Every row of the grid: the header, the rows the query matches, the group
// headers, and the Total row.
const rowCount = computed(
  () =>
    1 +
    (matrix.source.data.value?.total ?? matrix.rows.rows.value.length) +
    groupHeaderCount.value +
    (hasTotalRow.value ? 1 : 0),
);

const isFirstLoad = computed(
  () => matrix.source.isLoading.value && !matrix.source.data.value,
);
const isRefreshing = computed(
  () => matrix.source.isLoading.value && Boolean(matrix.source.data.value),
);

const format = (value: number) =>
  new Intl.NumberFormat(locale.value).format(value);
const columnTotal = (column: MatrixColumn) =>
  format(matrix.totals.value.columns[column.id] ?? 0);
const columnTarget = (column: MatrixColumn) => {
  const target = matrix.targets.value?.columns?.[column.id];
  return target === undefined ? "" : format(target);
};
const alignClass = (column: MatrixColumn) =>
  MATRIX_ALIGN_CLASSES[columnAlign(column)];
const stickyStyle = (start?: number) =>
  start === undefined ? undefined : { insetInlineStart: `${start}px` };

const rowStyle = computed(() => ({
  "--dms-matrix-row-h": ROW_HEIGHTS[matrix.options.density ?? "comfortable"],
}));
const scrollStyle = computed(() =>
  matrix.options.maxHeight
    ? { maxHeight: matrix.options.maxHeight }
    : undefined,
);

const observer = useIntersectionObserver(
  sentinel,
  (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    if (hasHiddenRows.value) revealed.value += REVEAL_BATCH;
    else void matrix.source.loadMore();
  },
  {
    root: () => (matrix.options.maxHeight ? scroller.value : null),
    rootMargin: SCROLL_MARGIN,
  },
);
// A sentinel still in view after rows landed asks for the next ones.
watch(
  () => items.value.length,
  () => {
    observer.pause();
    observer.resume();
  },
);

const FOOT_CELL =
  "h-9 border-t border-e border-(--ui-border-default) bg-(--dms-bg-muted) px-3 font-mono text-xs font-semibold tabular-nums";
const TOTAL_CELL =
  "h-[var(--dms-matrix-row-h)] border-e border-b border-(--ui-border-muted) bg-(--dms-bg-muted) px-3 text-end font-mono font-semibold tabular-nums";
</script>

<template>
  <div
    ref="scroller"
    class="relative [scrollbar-width:thin] overflow-auto overscroll-contain"
    :style="{ ...scrollStyle, ...rowStyle }"
    @mouseleave="matrix.interaction.hover.value = null"
  >
    <div
      v-if="isRefreshing"
      class="pointer-events-none sticky start-0 top-0 z-40 h-0.5 w-full overflow-hidden"
      role="progressbar"
      :aria-label="t('dms.matrix.loading')"
    >
      <span
        class="absolute inset-y-0 start-0 w-1/2 animate-[carousel_1.3s_ease-in-out_infinite] rounded-full bg-(--dms-accent-fill)"
      />
    </div>
    <table
      role="grid"
      :aria-label="matrix.text(matrix.options.title) || undefined"
      :aria-rowcount="rowCount"
      :aria-colcount="slots.length + 1"
      :aria-busy="matrix.source.isLoading.value || undefined"
      class="text-default table-fixed border-separate border-spacing-0 text-[13px]"
      :class="isRefreshing && 'opacity-70 transition-opacity delay-200'"
      :style="{ width: `${tableWidth}px`, minWidth: '100%' }"
      @keydown="matrix.interaction.onKeydown"
    >
      <colgroup>
        <col :style="{ width: `${rowHeaderWidth}px` }" />
        <col
          v-for="slot in slots"
          :key="slot.key"
          :style="{
            width: `${slot.type === 'total' ? TOTAL_COLUMN_WIDTH : matrix.columns.widthOf(slot.column)}px`,
          }"
        />
      </colgroup>
      <thead class="sticky top-0 z-20">
        <tr role="row" aria-rowindex="1">
          <th
            scope="col"
            role="columnheader"
            aria-colindex="1"
            class="sticky start-0 z-30 border-e border-b border-(--ui-border-default) bg-(--dms-bg-muted) px-3 py-1.5 text-start align-bottom font-normal"
          >
            <span class="flex items-center gap-2">
              <UCheckbox
                v-if="isSelectable"
                :model-value="matrix.selection.allState.value"
                :aria-label="t('dms.matrix.select_all')"
                @update:model-value="matrix.selection.toggleAll()"
              />
              <span class="text-dimmed" :class="EYEBROW_CLASS">
                {{ rowHeaderLabel }}
              </span>
            </span>
          </th>
          <template v-for="slot in slots" :key="slot.key">
            <MatrixHeaderCell
              v-if="slot.type === 'column'"
              :column="slot.column"
              :col-index="slot.colIndex"
              :width="matrix.columns.widthOf(slot.column)"
              :sticky-start="slot.stickyStart"
            />
            <th
              v-else
              scope="col"
              role="columnheader"
              :aria-colindex="slot.colIndex"
              class="border-e border-b border-(--ui-border-default) bg-(--dms-bg-muted) px-3 py-1.5 text-end align-bottom font-normal"
            >
              <span class="text-dimmed" :class="EYEBROW_CLASS">
                {{ totalLabel }}
              </span>
            </th>
          </template>
        </tr>
      </thead>
      <tbody v-if="isFirstLoad" aria-busy="true">
        <tr v-for="index in SKELETON_ROWS" :key="index">
          <td
            :colspan="slots.length + 1"
            class="h-[var(--dms-matrix-row-h)] border-b border-(--ui-border-muted) px-3"
          >
            <USkeleton
              class="h-2.5 rounded-md"
              :style="{ width: `${40 + ((index * 17) % 50)}%` }"
              :aria-label="t('dms.matrix.loading')"
            />
          </td>
        </tr>
      </tbody>
      <tbody v-else>
        <template v-for="item in items" :key="item.key">
          <MatrixGroupHeader
            v-if="item.type === 'group'"
            :aria-rowindex="item.index"
            :section="item.section"
            :grid-slots="slots"
          />
          <tr
            v-else
            role="row"
            :aria-rowindex="item.index"
            :aria-selected="
              isSelectable
                ? matrix.selection.isSelected(item.row.id)
                : undefined
            "
            :data-row-id="item.row.id"
          >
            <MatrixRowHeaderCell
              :row="item.row"
              :number="item.number"
              :width="rowHeaderWidth"
            />
            <template v-for="slot in slots" :key="slot.key">
              <MatrixCell
                v-if="slot.type === 'column'"
                :row="item.row"
                :column="slot.column"
                :col-index="slot.colIndex"
                :sticky-start="slot.stickyStart"
              />
              <td
                v-else
                role="gridcell"
                :aria-colindex="slot.colIndex"
                aria-readonly="true"
                :class="[
                  TOTAL_CELL,
                  matrix.misses.value.rows.has(item.row.id)
                    ? 'text-error'
                    : 'text-highlighted',
                ]"
              >
                {{ format(matrix.totals.value.rows[item.row.id] ?? 0) }}
              </td>
            </template>
          </tr>
        </template>
      </tbody>
      <tfoot v-if="hasTotalRow && !isFirstLoad" class="sticky bottom-0 z-20">
        <tr role="row" :aria-rowindex="rowCount">
          <th
            scope="row"
            role="rowheader"
            aria-colindex="1"
            class="sticky start-0 z-30 h-9 border-e border-t border-(--ui-border-default) bg-(--dms-bg-muted) px-3 text-start font-normal"
          >
            <span class="text-dimmed" :class="EYEBROW_CLASS">
              {{ totalLabel }}
            </span>
          </th>
          <template v-for="slot in slots" :key="slot.key">
            <td
              v-if="slot.type === 'column'"
              role="gridcell"
              :aria-colindex="slot.colIndex"
              aria-readonly="true"
              :class="[
                FOOT_CELL,
                alignClass(slot.column),
                matrix.misses.value.columns.has(slot.column.id)
                  ? 'text-error'
                  : 'text-highlighted',
                slot.stickyStart !== undefined && 'sticky z-30',
              ]"
              :style="stickyStyle(slot.stickyStart)"
            >
              <template v-if="isTotalledColumn(slot.column)">
                {{ columnTotal(slot.column) }}
                <span
                  v-if="columnTarget(slot.column)"
                  class="text-dimmed font-normal"
                >
                  / {{ columnTarget(slot.column) }}
                </span>
              </template>
            </td>
            <td
              v-else
              role="gridcell"
              :aria-colindex="slot.colIndex"
              aria-readonly="true"
              :class="[
                FOOT_CELL,
                'text-end',
                matrix.misses.value.total ? 'text-error' : 'text-highlighted',
              ]"
            >
              {{ format(matrix.totals.value.total) }}
            </td>
          </template>
        </tr>
      </tfoot>
    </table>
    <div
      v-if="hasMore"
      ref="sentinel"
      class="text-dimmed flex h-10 items-center justify-center gap-2 text-xs"
    >
      <UIcon
        v-if="matrix.source.isLoadingMore.value"
        name="i-ph-circle-notch"
        class="size-3.5 animate-spin"
      />
      {{
        matrix.source.isLoadingMore.value ? t("dms.matrix.loading_more") : ""
      }}
    </div>
  </div>
</template>
