<script setup lang="ts">
import { computed, useTemplateRef, watch } from "vue";
import { useIntersectionObserver } from "@vueuse/core";
import type { MatrixColumn, MatrixRow } from "../../../types/matrix";
import { EYEBROW_CLASS } from "../../utils/eyebrow";
import { useMatrixContext } from "../../composables/matrix/useMatrix";
import type { MatrixSection } from "../../composables/matrix/matrixSections";
import { kindOf } from "../../composables/matrix/matrixValues";
import MatrixCell from "./MatrixCell.vue";
import MatrixGroupHeader from "./MatrixGroupHeader.vue";
import MatrixHeaderCell from "./MatrixHeaderCell.vue";
import MatrixRowHeaderCell from "./MatrixRowHeaderCell.vue";

/**
 * The grid itself (`role="grid"`): a sticky header row, a sticky row header
 * column and pinned columns, the rows under their group headers, a Total
 * column and a sticky Total row, skeleton rows on a first load, a thin bar
 * while a read runs, and the sentinel reading the next rows of an infinite
 * grid.
 */
const matrix = useMatrixContext();
const { t, locale } = useI18n();

const DEFAULT_ROW_HEADER_WIDTH = 200;
const NUMBERS_WIDTH = 36;
const TOTAL_COLUMN_WIDTH = 112;
const SKELETON_ROWS = 6;
const SCROLL_MARGIN = "400px";
const ROW_HEIGHTS = { compact: "36px", comfortable: "44px" } as const;

const scroller = useTemplateRef<HTMLElement>("scroller");
const sentinel = useTemplateRef<HTMLElement>("sentinel");
watch(scroller, (element) => {
  matrix.root.value = element;
});

const columns = computed(() => matrix.columns.visible.value);
const hasNumbers = computed(() => matrix.options.rowHeader?.numbers === true);
const rowHeaderWidth = computed(
  () =>
    (matrix.options.rowHeader?.width ?? DEFAULT_ROW_HEADER_WIDTH) +
    (hasNumbers.value ? NUMBERS_WIDTH : 0),
);
const hasTotalColumn = computed(() => matrix.options.totals?.rows === true);
const hasTotalRow = computed(() => matrix.options.totals?.columns === true);
const totalLabel = computed(
  () => matrix.text(matrix.options.totals?.label) || t("dms.matrix.total"),
);
const rowHeaderLabel = computed(
  () => matrix.text(matrix.options.rowHeader?.label) || "",
);

/** `left` of each pinned column: after the row header and the pinned before it. */
const stickyLefts = computed(() => {
  const lefts: Record<string, number> = {};
  let left = rowHeaderWidth.value;
  for (const column of columns.value) {
    if (!column.pinned) break;
    lefts[column.id] = left;
    left += matrix.columns.widthOf(column);
  }
  return lefts;
});
const tableWidth = computed(
  () =>
    rowHeaderWidth.value +
    columns.value.reduce(
      (sum, column) => sum + matrix.columns.widthOf(column),
      0,
    ) +
    (hasTotalColumn.value ? TOTAL_COLUMN_WIDTH : 0),
);

/** A group header or a row, in the order drawn, with its `aria-rowindex`. */
type GridItem =
  | { type: "group"; key: string; section: MatrixSection; index: number }
  | {
      type: "row";
      key: string;
      row: MatrixRow;
      index: number;
      number?: number;
    };

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
// The header row is row 1.
const FIRST_BODY_ROW_INDEX = 2;

const items = computed<GridItem[]>(() => {
  const list: GridItem[] = [];
  let index = FIRST_BODY_ROW_INDEX;
  for (const section of matrix.rows.sections.value) {
    if (section.group)
      list.push({
        type: "group",
        key: `g:${section.key}`,
        section,
        index: index++,
      });
    if (section.group && matrix.rows.isCollapsed(section.key)) continue;
    for (const row of section.rows) {
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

const isFirstLoad = computed(
  () => matrix.source.isLoading.value && !matrix.source.data.value,
);
const isRefreshing = computed(
  () => matrix.source.isLoading.value && Boolean(matrix.source.data.value),
);
const entryCell = computed(() => {
  const row = matrix.rows.shown.value[0];
  const column = columns.value[0];
  return row && column ? { rowId: row.id, columnId: column.id } : null;
});
const isEntry = (row: MatrixRow, column: MatrixColumn) =>
  !matrix.interaction.focus.value &&
  entryCell.value?.rowId === row.id &&
  entryCell.value.columnId === column.id;

const format = (value: number) =>
  new Intl.NumberFormat(locale.value).format(value);
const isNumberColumn = (column: MatrixColumn) => kindOf(column) === "number";
const columnTotal = (column: MatrixColumn) =>
  format(matrix.totals.value.columns[column.id] ?? 0);
const columnTarget = (column: MatrixColumn) => {
  const target = matrix.targets.value?.columns?.[column.id];
  return target === undefined ? "" : format(target);
};

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
    if (entries.some((entry) => entry.isIntersecting))
      void matrix.source.loadMore();
  },
  {
    root: () => (matrix.options.maxHeight ? scroller.value : null),
    rootMargin: SCROLL_MARGIN,
  },
);
// A sentinel still in view after a page landed asks for the next one.
watch(
  () => matrix.source.data.value?.rows.length,
  () => {
    observer.pause();
    observer.resume();
  },
);

const FOOT_CELL =
  "h-9 border-t border-e border-(--ui-border-default) bg-(--dms-bg-muted) px-3 text-end font-mono text-xs font-semibold tabular-nums";
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
      class="pointer-events-none sticky top-0 left-0 z-40 h-0.5 w-full overflow-hidden"
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
      :aria-rowcount="
        (matrix.source.data.value?.total ?? matrix.rows.rows.value.length) + 1
      "
      :aria-colcount="columns.length + 1 + (hasTotalColumn ? 1 : 0)"
      :aria-busy="matrix.source.isLoading.value || undefined"
      class="text-default table-fixed border-separate border-spacing-0 text-[13px]"
      :class="isRefreshing && 'opacity-70 transition-opacity delay-200'"
      :style="{ width: `${tableWidth}px`, minWidth: '100%' }"
      @keydown="matrix.interaction.onKeydown"
    >
      <colgroup>
        <col :style="{ width: `${rowHeaderWidth}px` }" />
        <col
          v-for="column in columns"
          :key="column.id"
          :style="{ width: `${matrix.columns.widthOf(column)}px` }"
        />
        <col
          v-if="hasTotalColumn"
          :style="{ width: `${TOTAL_COLUMN_WIDTH}px` }"
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
            <span class="text-dimmed" :class="EYEBROW_CLASS">
              {{ rowHeaderLabel }}
            </span>
          </th>
          <MatrixHeaderCell
            v-for="(column, index) in columns"
            :key="column.id"
            :column="column"
            :col-index="index + 2"
            :width="matrix.columns.widthOf(column)"
            :sticky-left="stickyLefts[column.id]"
          />
          <th
            v-if="hasTotalColumn"
            scope="col"
            role="columnheader"
            :aria-colindex="columns.length + 2"
            class="border-b border-(--ui-border-default) bg-(--dms-bg-muted) px-3 py-1.5 text-end align-bottom font-normal"
          >
            <span class="text-dimmed" :class="EYEBROW_CLASS">
              {{ totalLabel }}
            </span>
          </th>
        </tr>
      </thead>
      <tbody v-if="isFirstLoad" aria-busy="true">
        <tr v-for="index in SKELETON_ROWS" :key="index">
          <td
            :colspan="columns.length + 1 + (hasTotalColumn ? 1 : 0)"
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
            :columns="columns"
            :sticky-lefts="stickyLefts"
            :has-total-column="hasTotalColumn"
          />
          <tr
            v-else
            role="row"
            :aria-rowindex="item.index"
            :data-row-id="item.row.id"
          >
            <MatrixRowHeaderCell
              :row="item.row"
              :number="item.number"
              :width="rowHeaderWidth"
            />
            <MatrixCell
              v-for="(column, index) in columns"
              :key="column.id"
              :row="item.row"
              :column="column"
              :col-index="index + 2"
              :sticky-left="stickyLefts[column.id]"
              :is-entry="isEntry(item.row, column)"
            />
            <td
              v-if="hasTotalColumn"
              role="gridcell"
              :aria-colindex="columns.length + 2"
              aria-readonly="true"
              class="h-[var(--dms-matrix-row-h)] border-b border-(--ui-border-muted) bg-(--dms-bg-muted) px-3 text-end font-mono font-semibold tabular-nums"
              :class="
                matrix.misses.value.rows.has(item.row.id)
                  ? 'text-error'
                  : 'text-highlighted'
              "
            >
              {{ format(matrix.totals.value.rows[item.row.id] ?? 0) }}
            </td>
          </tr>
        </template>
      </tbody>
      <tfoot v-if="hasTotalRow && !isFirstLoad" class="sticky bottom-0 z-20">
        <tr role="row">
          <th
            scope="row"
            role="rowheader"
            class="sticky start-0 z-30 h-9 border-e border-t border-(--ui-border-default) bg-(--dms-bg-muted) px-3 text-start font-normal"
          >
            <span class="text-dimmed" :class="EYEBROW_CLASS">
              {{ totalLabel }}
            </span>
          </th>
          <td
            v-for="column in columns"
            :key="column.id"
            role="gridcell"
            aria-readonly="true"
            :class="[
              FOOT_CELL,
              matrix.misses.value.columns.has(column.id)
                ? 'text-error'
                : 'text-highlighted',
              column.id in stickyLefts && 'sticky z-30',
            ]"
            :style="
              column.id in stickyLefts
                ? { left: `${stickyLefts[column.id]}px` }
                : undefined
            "
          >
            <template v-if="isNumberColumn(column)">
              {{ columnTotal(column) }}
              <span v-if="columnTarget(column)" class="text-dimmed font-normal">
                / {{ columnTarget(column) }}
              </span>
            </template>
          </td>
          <td
            v-if="hasTotalColumn"
            role="gridcell"
            aria-readonly="true"
            :class="[
              FOOT_CELL,
              matrix.misses.value.total ? 'text-error' : 'text-highlighted',
            ]"
          >
            {{ format(matrix.totals.value.total) }}
          </td>
        </tr>
      </tfoot>
    </table>
    <div
      v-if="matrix.source.hasMore.value"
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
