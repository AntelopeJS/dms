<script lang="ts">
export type * from "./Table.types";
</script>

<script setup lang="ts" generic="T extends Data">
import type {
  ColumnPinningState,
  ColumnSizingState,
  ExpandedState,
  Header,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from "@tanstack/vue-table";
import { useTable } from "../../composables/table/useTable";
import {
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_SIZE,
} from "../../composables/table/constants";
import { useRowScrollAnchor } from "../../composables/table/useRowScrollAnchor";
import type { TableViewDisplayCapabilities } from "../../../composables/table-view/types";
import { useReorderHandles } from "../../composables/table-view/useReorderHandles";
import { FlexRender } from "@tanstack/vue-table";
import { computed, shallowRef, useId, useSlots, watchEffect } from "vue";
import { provideLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import TableActions from "./Actions.vue";
import TablePagination from "./Pagination.vue";
import TableFiltersRow from "./FiltersRow.vue";
import TableRowSelection from "./RowSelection.vue";
import TableTabs from "./Tabs.vue";
import { createTableViewDeleteShortcut } from "../../../composables/table-view/shortcuts/tableViewDelete";
import { FULL_TABLE_CHROME } from "../../composables/table-view/utils/chrome";

import type {
  TableDensity,
  TableProps,
  TableEmits,
  TableFilter,
  TableSharedData,
} from "./Table.types";
import { HEADER_MATCH_BG, theme } from "./tableComponentTheme";
import { useTableComponentGroups } from "./tableComponentGroups";
import { useTableComponentRows } from "./tableComponentRows";
import { useTableComponentScroll } from "./tableComponentScroll";
import { useTableComponentPinning } from "./tableComponentPinning";
import { useTableComponentPreferences } from "./tableComponentPreferences";
import { useTableComponentHeader } from "./tableComponentHeader";
import { useTableComponentFilters } from "./tableComponentFilters";
import TableBody from "./TableBody.vue";
import type { TableBodyContext } from "./TableBody.types";

const DEFAULT_CAPABILITIES = resolveDisplayCapabilities({
  columnManagement: true,
});

const props = withDefaults(defineProps<TableProps<T>>(), {
  firstPageLoading: undefined,
});
const emits = defineEmits<TableEmits<T>>();

// oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Module theme configuration is unchecked; retain its existing contract derived from this component's normalized theme.
const appConfig = useDmsAppConfig() as ReturnType<typeof useDmsAppConfig> & {
  ui: { table: Partial<typeof theme> };
};

const globalFilterState = defineModel<string>("globalFilter", {
  default: "",
});
const columnFiltersState = defineModel<TableFilter[]>("columnFilters", {
  default: (): TableFilter[] => [],
});
const columnOrderState = defineModel<string[]>("columnOrderState", {
  default: (): string[] => [],
});
const columnVisibilityState = defineModel<VisibilityState>("columnVisibility", {
  default: (): VisibilityState => ({}),
});
const columnPinningState = defineModel<ColumnPinningState>("columnPinning", {
  default: (): ColumnPinningState => ({}),
});
const columnSizingState = defineModel<ColumnSizingState>("columnSizing", {
  default: (): ColumnSizingState => ({}),
});
const rowSelectionState = defineModel<RowSelectionState>("rowSelection", {
  default: (): RowSelectionState => ({}),
});
const sortingState = defineModel<SortingState>("sorting", {
  default: (): SortingState => [],
});
const filtersRowOpen = defineModel<boolean>("filtersRowOpen", {
  default: false,
});
const activeTabId = defineModel<string>("activeTab", { default: "" });
const activeDisplayState = defineModel<string>("activeDisplay", {
  default: "table",
});
const kanbanGroupByState = defineModel<string>("kanbanGroupBy", {
  default: "",
});
const groupedGroupByState = defineModel<string>("groupedGroupBy", {
  default: "",
});
const expandedState = defineModel<ExpandedState>("expanded", {
  default: (): ExpandedState => ({}),
});
const showArchivedState = defineModel<boolean>("showArchived", {
  default: false,
});
const densityState = defineModel<TableDensity>("density", {
  default: "default",
});

const allMatchingState = defineModel<boolean>("allMatching", {
  default: false,
});

const slots = useSlots();

const isExpandable = !!slots.expanded;

const tableDomId = `dms-table-${useId()}`;
const expandedRowDomId = (rowId: string): string =>
  `${tableDomId}-detail-${rowId.replace(/\s+/g, "_")}`;

const isShowingArchived = computed(
  () => !!props.archiveToggle && showArchivedState.value,
);

const SKELETON_MAX_ROW_COUNT = MAX_PAGE_SIZE;
const SKELETON_TOTAL_FADE = 0.7;
const SKELETON_WIDTHS = ["62%", "48%", "70%", "54%", "40%"];
const skeletonWidth = (rowIndex: number, columnIndex: number): string =>
  SKELETON_WIDTHS[(rowIndex + columnIndex) % SKELETON_WIDTHS.length]!;

const {
  hasScrollArea,
  isScrolled,
  scrollEdges,
  onTableScroll,
  tableRootRef,
  tableViewportWidth,
  rootStyle,
  tableRootStyle,
  syncClippedTitle,
} = useTableComponentScroll(props);

const paginationState = defineModel<PaginationState>("pagination", {
  default: (): PaginationState => ({
    pageIndex: DEFAULT_PAGE_INDEX,
    pageSize: DEFAULT_PAGE_SIZE,
  }),
});

const isFirstPageLoading = computed(
  () => props.firstPageLoading ?? (!!props.loading && !props.data?.length),
);
const skeletonRowCount = computed(() =>
  Math.min(
    paginationState.value.pageSize || DEFAULT_PAGE_SIZE,
    SKELETON_MAX_ROW_COUNT,
  ),
);
const skeletonRowOpacity = (rowIndex: number): number =>
  1 - ((rowIndex - 1) * SKELETON_TOTAL_FADE) / skeletonRowCount.value;

const onResize = (
  event: MouseEvent | TouchEvent,
  header: Header<T, unknown>,
) => {
  header.getResizeHandler()?.(event);
};

const PRESENCE_RAIL_WIDTH = 2;
const PRESENCE_RAIL_WIDTH_PX = `${PRESENCE_RAIL_WIDTH}px`;

const SELECTION_RAIL_BG = "bg-primary";

const hasPresenceRail = computed(() => props.presenceByRow !== undefined);

const leadingCellCount = computed(
  () => (hasPresenceRail.value ? 1 : 0) + (props.reorder ? 1 : 0),
);

const reorderHandles = useReorderHandles({
  reorder: () => props.reorder,
  count: () => table.getRowModel().rows.length,
});

const {
  scrollFadeInsets,
  getPinnedLeftOffset,
  getPinnedRightOffset,
  getPinnedVariant,
  getHeaderWidth,
  headerAriaSort,
} = useTableComponentPinning(() => table, tableViewportWidth, hasPresenceRail);

const isUsingDefaultSort = computed(() => {
  if (!props.defaultSort) return false;
  if (sortingState.value.length !== 1) return false;
  const [current] = sortingState.value;
  if (!current) return false;
  return (
    current.id === props.defaultSort.field &&
    current.desc === (props.defaultSort.desc ?? false)
  );
});

const uiTableRoot = tv({
  extend: tv(theme),
  ...appConfig.ui?.table,
});
const uiTable = computed(() =>
  uiTableRoot({
    density: densityState.value,
    scrollArea: hasScrollArea.value,
    scrolled: isScrolled.value,
    archived: isShowingArchived.value,
  }),
);

const {
  table,
  declaredColumnOrder,
  labeledColumns,
  deleteFilter,
  deleteSorting,
} = useTable<T>({
  tableProps: props,
  emits,
  states: {
    globalFilterState,
    columnFiltersState,
    columnOrderState,
    columnVisibilityState,
    columnPinningState,
    columnSizingState,
    rowSelectionState,
    sortingState,
    expandedState,
    paginationState,
  },
  ui: uiTable,
  expandable: isExpandable,
  expandedRowDomId,
  showArchived: props.archiveToggle ? isShowingArchived : undefined,
  columnMenus: (props.chrome ?? FULL_TABLE_CHROME).columnMenus,
});

const rowCount = computed(() => props.paginationOptions?.rowCount ?? 0);

const { bodyEntries, collapsedGroups, toggleGroup } = useTableComponentGroups(
  props,
  table,
);

useRowScrollAnchor(tableRootRef, () =>
  bodyEntries.value
    .filter((entry) => entry.kind === "row")
    .map((entry) => entry.id),
);

const { t, locale } = useI18n();

const {
  captionCountLabel,
  hasTabs,
  hasViewsBand,
  hasViewsInHeader,
  resolvedChrome,
  tabsInline,
  toolbarButtons,
  canAddFromToolbar,
  addLabel,
  addIcon,
  hasBulkActions,
} = useTableComponentHeader(props, slots, rowCount, isShowingArchived, {
  t,
  locale,
});

const resolvedCapabilities = computed<Required<TableViewDisplayCapabilities>>(
  () => props.activeCapabilities ?? DEFAULT_CAPABILITIES,
);

const {
  filtersCleared,
  resetFilters,
  clearSearch,
  clearFilters,
  clearableFilters,
  isFiltered,
} = useTableComponentFilters(props, {
  columnFiltersState,
  globalFilterState,
  paginationState,
  resolvedCapabilities,
});

const { hasCustomSort, resetSorting, hasCustomColumns } =
  useTableComponentPreferences(
    props,
    {
      columnOrderState,
      columnPinningState,
      columnVisibilityState,
      sortingState,
      isUsingDefaultSort,
    },
    declaredColumnOrder,
  );

const tableSharedData = shallowRef<TableSharedData<T>>(null!);

watchEffect(() => {
  tableSharedData.value = {
    table,
    emits,
    globalFilterState,
    columnFiltersState,
    columnOrderState,
    columnVisibilityState,
    columnPinningState,
    sortingState,
    filtersRowOpenState: filtersRowOpen,
    paginationState,
    labeledColumns,
    customNavItems: props.customNavItems || [],
    hasCustomSort,
    defaultSort: props.defaultSort,
    defaultSortLabel: props.defaultSortLabel,
    defaultSortKind: props.defaultSortKind,
    isUsingDefaultSort,
    resetSorting,
    hasCustomColumns,
    deleteFilter,
    urlFilters: props.urlFilters ?? [],
    resetFilters,
    clearSearch,
    clearFilters,
    clearableFilters,
    isFiltered,
    onFiltersCleared: filtersCleared.on,
    deleteSorting,
    rowCount: rowCount.value,
    firstPageLoading: isFirstPageLoading.value,
    displays: props.displays || [],
    hasDisplaySwitcher: (props.displays?.length ?? 0) > 1,
    activeDisplayState,
    activeCapabilities: resolvedCapabilities,
    kanbanGroupByState,
    kanbanGroupByOptions: props.kanbanGroupByOptions || [],
    groupedGroupByState,
    groupedGroupByOptions: props.groupedGroupByOptions || [],
    showArchivedState,
    densityState,
    chrome: resolvedChrome,
    footer: props.footer,
    defaultPageSize: props.defaultPageSize,
    accumulation: props.accumulation,
    emptyStates: props.emptyStates,
    addLabel: addLabel.value,
    addIcon: addIcon.value,
  };
});

provideLocal("tableSharedData", tableSharedData);

const {
  hoveredRowId,
  handleRowHover,
  handleRowLeave,
  getRowPresence,
  presenceTooltipText,
  isRowClickable,
  handleRowPointer,
  isOpenRow,
  isSingleClickRow,
  presenceRailBackground,
} = useTableComponentRows(props, emits, t);

const bodyContext = computed<TableBodyContext<T>>(() => ({
  t,
  uiTable: uiTable.value,
  table,
  bodyEntries: bodyEntries.value,
  leadingCellCount: leadingCellCount.value,
  collapsedGroups: collapsedGroups.value,
  toggleGroup,
  isOpenRow,
  getRowPresence,
  presenceTooltipText,
  isRowClickable,
  isSingleClickRow,
  handleRowPointer,
  handleRowHover,
  handleRowLeave,
  reorderHandles,
  hasPresenceRail: hasPresenceRail.value,
  SELECTION_RAIL_BG,
  presenceRailBackground,
  PRESENCE_RAIL_WIDTH_PX,
  getPinnedVariant,
  getPinnedLeftOffset,
  getPinnedRightOffset,
  syncClippedTitle,
  expandedRowDomId,
  isFirstPageLoading: isFirstPageLoading.value,
  skeletonRowCount: skeletonRowCount.value,
  skeletonRowOpacity,
  skeletonWidth,
  isShowingArchived: isShowingArchived.value,
  grouping: props.grouping,
  loading: props.loading,
  reorder: props.reorder,
  rowActions: props.rowActions,
  loadError: props.loadError,
  emptyStates: props.emptyStates,
}));

defineShortcuts({
  delete: createTableViewDeleteShortcut(
    hoveredRowId,
    props.rowActions,
    (ids: string[]) => emits("delete", ids),
  ),
});
</script>

<template>
  <div :class="uiTable.root()" :style="rootStyle">
    <template v-if="resolvedCapabilities.header">
      <header
        :class="
          uiTable.header({
            headerDivided: (!hasTabs && !hasViewsBand) || tabsInline,
            tabsInline,
          })
        "
      >
        <TableTabs
          v-if="tabsInline && tabs"
          v-model="activeTabId"
          :tabs="tabs"
          :label="caption"
          inline
        />
        <h2 v-else-if="resolvedChrome.caption" :class="uiTable.caption()">
          <span :class="uiTable.captionLabel()" @mouseenter="syncClippedTitle">
            {{ caption }}
          </span>
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            v-if="isFirstPageLoading"
            aria-hidden="true"
            :class="uiTable.captionCountPlaceholder()"
          />
          <span v-else-if="rowCount > 0" :class="uiTable.captionCount()">
            {{ captionCountLabel }}
          </span>
        </h2>

        <slot v-if="hasViewsInHeader" name="views" />

        <TableActions
          v-model:global-filter="globalFilterState"
          v-model:column-visibility="columnVisibilityState"
          v-model:sorting="sortingState"
          v-model:show-archived="showArchivedState"
          :table
          :can-add-row="canAddFromToolbar"
          :add-label="addLabel"
          :add-icon="addIcon"
          :archive-toggle="archiveToggle"
          :custom-buttons="toolbarButtons"
          :on-custom-button="onCustomButton"
          :chrome="resolvedChrome"
          :search-placeholder="searchPlaceholder"
          :search-shortcut="searchShortcut"
          :quick-filters="quickFilters"
          :class="{
            'ms-auto': !resolvedChrome.caption && !tabsInline,
            'py-2': tabsInline,
          }"
        />
      </header>

      <slot v-if="hasViewsBand" name="views" />

      <TableTabs
        v-if="hasTabs && tabs && !tabsInline"
        v-model="activeTabId"
        :tabs="tabs"
      />

      <TableFiltersRow
        v-if="
          (filtersRowOpen || !!urlFilters?.length) &&
          resolvedCapabilities.filters &&
          resolvedChrome.filters
        "
      />

      <div
        v-if="isShowingArchived"
        role="status"
        :class="uiTable.archiveStrip()"
      >
        <UIcon name="i-ph-archive" :class="uiTable.archiveStripIcon()" />
        <span :class="uiTable.archiveStripText()">
          <strong :class="uiTable.archiveStripTitle()">
            {{ t("dms.table.archive_strip_title") }}
          </strong>
          {{ " " }}
          <span :class="uiTable.archiveStripDescription()">
            {{ t("dms.table.archive_strip_description") }}
          </span>
        </span>
        <UButton
          :label="t('dms.table.show_active')"
          :icon="appConfig.ui.icons.arrowLeft"
          color="neutral"
          variant="ghost"
          size="xs"
          :class="uiTable.archiveStripAction()"
          @click="showArchivedState = false"
        />
      </div>

      <TableRowSelection
        v-if="hasBulkActions"
        v-model:row-selection="rowSelectionState"
        v-model:all-matching="allMatchingState"
        :row-actions="rowActions"
        :bulk-actions="bulkActions"
        :total="rowCount"
        :can-export="canExport"
        :archived="isShowingArchived"
      />
    </template>

    <!-- A strip the table view adds over its rows (the live hold's "N new"),
         shown whichever chrome the display keeps. -->
    <slot name="notice" />

    <slot name="body" :table="table">
      <div :class="uiTable.scrollFrame()">
        <section
          ref="tableRoot"
          :class="uiTable.tableRoot()"
          :style="tableRootStyle"
          @scroll.passive="onTableScroll"
        >
          <div
            v-if="loading && !isFirstPageLoading"
            aria-hidden="true"
            :class="uiTable.loadingBar()"
          >
            <span :class="uiTable.loadingBarIndicator()" />
          </div>

          <div ref="tableBase" :class="uiTable.tableBase()">
            <table :class="uiTable.table()">
              <caption v-if="caption" :class="uiTable.tableCaption()">
                {{ caption }}
              </caption>

              <thead ref="tableHead">
                <tr
                  v-for="headerGroup in table.getHeaderGroups()"
                  :key="headerGroup.id"
                >
                  <th
                    v-if="hasPresenceRail"
                    :class="[
                      HEADER_MATCH_BG,
                      'border-b-default sticky left-0 z-30 border-b p-0',
                      hasScrollArea && 'top-0 z-40',
                    ]"
                    :style="{
                      width: PRESENCE_RAIL_WIDTH_PX,
                      minWidth: PRESENCE_RAIL_WIDTH_PX,
                    }"
                  />
                  <th
                    v-if="reorder"
                    :class="uiTable.handleHeadCell()"
                    :aria-label="t('dms.table.reorder.column')"
                  />
                  <th
                    v-for="header in headerGroup.headers"
                    :key="header.id"
                    :colspan="header.colSpan"
                    :aria-sort="headerAriaSort(header.column)"
                    :data-pinned="header.column.getIsPinned()"
                    :class="
                      uiTable.headCell({
                        pinned: getPinnedVariant(header.column),
                      })
                    "
                    :style="{
                      width: getHeaderWidth(header),
                      left: getPinnedLeftOffset(header.column),
                      right: getPinnedRightOffset(header.column),
                    }"
                  >
                    <slot
                      :name="`${header.id}-header`"
                      v-bind="header.getContext()"
                    >
                      <FlexRender
                        v-if="!header.isPlaceholder"
                        :render="header.column.columnDef.header"
                        :props="header.getContext()"
                      />

                      <div
                        v-if="header.column.getCanResize()"
                        :class="
                          uiTable.colResizer({
                            isResizing: header.column.getIsResizing(),
                          })
                        "
                        @dblclick="header.column.resetSize()"
                        @mousedown="onResize($event, header)"
                        @touchstart="onResize($event, header)"
                      />
                    </slot>
                  </th>
                </tr>
              </thead>

              <TableBody :context="bodyContext">
                <template v-for="(_, name) in slots" #[name]="slotData">
                  <slot :name="name" v-bind="slotData" />
                </template>
              </TableBody>
            </table>
          </div>
        </section>
        <span
          v-if="scrollEdges.start"
          aria-hidden="true"
          data-table-scroll-fade="start"
          :class="uiTable.scrollFade({ side: 'start' })"
          :style="{ insetInlineStart: `${scrollFadeInsets.start}px` }"
        />
        <span
          v-if="scrollEdges.end"
          aria-hidden="true"
          data-table-scroll-fade="end"
          :class="uiTable.scrollFade({ side: 'end' })"
          :style="{ insetInlineEnd: `${scrollFadeInsets.end}px` }"
        />
      </div>

      <TablePagination />
    </slot>
  </div>
</template>
