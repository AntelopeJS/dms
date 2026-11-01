<script setup lang="ts" generic="T extends Data">
import type {
  TableViewConfig,
  TableViewExpandableConfig,
  TableViewFooter,
  TableViewQuickFilter,
  TableViewViewsConfig,
  TableViewEmptyStatesConfig,
  TableViewPaginationMode,
  TableViewSourceConfig,
  TableViewReorderConfig,
} from "../../composables/table-view/types";
import type { RowActionRule } from "#dms-core/app/types/row-action";
import type { TableViewLiveHoldOptions } from "#dms-core/app/types/live";
import DmsBlockStatus from "../../build/components/blocks/BlockStatus.vue";
import UTable from "../../build/components/table/Table.vue";
import ExpandedRowDetail from "../../build/components/table-view/ExpandedRowDetail.vue";
import LiveHoldBanner from "../../build/components/table-view/LiveHoldBanner.vue";
import TableViews from "../../build/components/table/Views.vue";
import { useTableViewSetup } from "../../build/composables/table-view/tableViewSetup";
import {
  resolveBlockState,
  useBlockStateAttributes,
} from "../../build/composables/blocks/blockDataState";

interface TableViewProps<T extends Data> extends TableViewConfig<T> {
  /** Expandable rows: caret column + detail band (backend `expandable`). */
  expandable?: TableViewExpandableConfig;
  /** Caption count while the archived rows show (backend `archivedCountLabel`). */
  archivedCountLabel?: string;
  /** Placeholder of the search field. */
  searchPlaceholder?: string;
  /** Key opening the search (`defineShortcuts` notation); `shift_f` else. */
  searchShortcut?: string;
  /** One-click dropdown filters of the toolbar. */
  quickFilters?: TableViewQuickFilter[];
  /** Rows per page while the user picked none. */
  pageSize?: number;
  /** How the rows beyond the first page are reached. */
  pagination?: TableViewPaginationMode;
  /** A `TableView.fromSource` table's route, instead of a data controller. */
  source?: TableViewSourceConfig;
  /** Rows ordered by hand on a number column (backend `reorder`). */
  reorder?: TableViewReorderConfig;
  /** Rows listed first whatever the sort (backend `pinnedRows`). */
  pinnedRows?: RowActionRule;
  /** Footer texts and figures: row count, hint, summaries and legend. */
  footer?: TableViewFooter;
  /** What the empty body says, per reason it is empty. */
  emptyStates?: TableViewEmptyStatesConfig;
  /** Named states of the table (backend `views`). */
  views?: TableViewViewsConfig;
  /** Key of the table view in its page, prefixing its URL keys. */
  tableId?: string;
  /** The page carries no other table view: `?view=` / `?tab=` are its own. */
  isSoleTableView?: boolean;
  /** Topics whose events make the table read its rows again. */
  realtimeTopic?: string | string[];
  /** Keeps the rows while the live page is paused (backend `liveHold`). */
  liveHold?: boolean | TableViewLiveHoldOptions;
}

const props = defineProps<TableViewProps<T>>();
const {
  listableColumns,
  initialVisibility,
  tableProps,
  enableTableExport,
  customButtons,
  kanbanGroupByOptions,
  activeDisplayId,
  availableDisplays,
  activeCapabilities,
  activeDisplayComponent,
  kanbanGroupBy,
  density,
  resolvedChrome,
  queryParamHiddenFilters,
  shownUrlFilters,
  removeUrlFilter,
  paginationState,
  rowSelect,
  groupedGroupByOptions,
  groupedGroupBy,
  tableDefaultSort,
  defaultSortLabel,
  defaultSortKind,
  sorting,
  columnFilters,
  columnVisibility,
  columnSizing,
  columnOrder,
  filtersRowOpen,
  globalFilter,
  showArchived,
  activeViewId,
  isViewModified,
  canSaveViews,
  selectView,
  resetView,
  saveView,
  saveAsNewView,
  deleteView,
  activeTabId,
  resolvedQuickFilters,
  openRowId,
  tableRoot,
  liveHold,
  data,
  isFirstPageLoading,
  isListLoading,
  listLoadError,
  listNotFound,
  shownResults,
  activeDisplayBlockedByError,
  viewItems,
  viewsLayout,
  hasViews,
  activeDisplayRef,
  resolvedFooter,
  accumulation,
  reorderState,
  grouping,
  refreshByUser,
  tabsWithCount,
  handleCustomButton,
  handleCustomRowAction,
  bulkCustomActions,
  allMatching,
  runBulkAction,
  canToggleArchived,
  customNavItems,
  deleteRows,
  archiveRows,
  restoreRows,
  handleExportTable,
  handleExportSelection,
  handleRowClick,
  handleRowDuplicate,
  handleRowAdd,
  presenceByRowFiltered,
  expandableConfig,
  expandedModel,
  expandedDetails,
  expandedRowLoadState,
  expandedRowProps,
  handleRowEdit,
  contextForSlot,
} = useTableViewSetup<T>(props);

const blockAttributes = useBlockStateAttributes("TableView", () =>
  resolveBlockState({
    loading: isListLoading.value,
    failed: Boolean(listLoadError.value || listNotFound.value),
    hasContent: (shownResults.value?.length ?? 0) > 0,
  }),
);
</script>

<template>
  <DmsBlockStatus
    v-if="listNotFound"
    v-bind="blockAttributes"
    state="not-found"
    :not-found="listNotFound"
  />
  <UTable
    v-else
    ref="tableRoot"
    v-bind="{ ...tableProps, ...blockAttributes }"
    v-model:pagination="paginationState"
    v-model:global-filter="globalFilter"
    v-model:sorting="sorting"
    v-model:row-selection="rowSelect"
    v-model:column-filters="columnFilters"
    v-model:column-visibility="columnVisibility"
    v-model:column-sizing="columnSizing"
    v-model:column-order-state="columnOrder"
    v-model:filters-row-open="filtersRowOpen"
    v-model:active-tab="activeTabId"
    v-model:active-display="activeDisplayId"
    v-model:kanban-group-by="kanbanGroupBy"
    v-model:grouped-group-by="groupedGroupBy"
    v-model:show-archived="showArchived"
    v-model:expanded="expandedModel"
    v-model:density="density"
    :chrome="resolvedChrome"
    :grouping="grouping"
    :accumulation="accumulation"
    :reorder="reorderState"
    :views-placement="viewsLayout === 'menu' ? 'header' : 'band'"
    :search-placeholder="props.searchPlaceholder"
    :search-shortcut="props.searchShortcut"
    :quick-filters="resolvedQuickFilters"
    :footer="resolvedFooter"
    :empty-states="props.emptyStates"
    :hidden-filters-apply="queryParamHiddenFilters.length > 0"
    :url-filters="shownUrlFilters"
    :default-page-size="props.pageSize"
    :archive-toggle="canToggleArchived"
    :archived-count-label="props.archivedCountLabel"
    :displays="availableDisplays"
    :active-capabilities="activeCapabilities"
    :kanban-group-by-options="kanbanGroupByOptions"
    :grouped-group-by-options="groupedGroupByOptions"
    :tabs="tabsWithCount"
    :initial-column-visibility="initialVisibility"
    :loading="isListLoading"
    :first-page-loading="isFirstPageLoading"
    :load-error="listLoadError"
    :data="shownResults || []"
    :pagination-options="{ manualPagination: true, rowCount: data?.total }"
    :sorting-options="{
      manualSorting: true,
      enableSorting: activeCapabilities.sorting,
    }"
    :default-sort="tableDefaultSort"
    :default-sort-label="defaultSortLabel"
    :default-sort-kind="defaultSortKind"
    :global-filter-options="{ enableGlobalFilter: false }"
    :columns="listableColumns"
    :custom-nav-items="customNavItems"
    :custom-buttons="customButtons"
    :can-export="enableTableExport"
    :on-custom-button="handleCustomButton"
    :on-custom-row-action="handleCustomRowAction"
    :bulk-actions="bulkCustomActions"
    v-model:all-matching="allMatching"
    :presence-by-row="presenceByRowFiltered"
    :open-row-id="openRowId"
    @add="handleRowAdd"
    @refresh="refreshByUser"
    @details="handleRowClick"
    @delete="(e) => deleteRows(e)"
    @archive="(e) => archiveRows(e)"
    @restore="(e) => restoreRows(e)"
    @export="handleExportSelection"
    @export-all="handleExportTable"
    @bulk-action="runBulkAction"
    @duplicate="handleRowDuplicate"
    @remove-url-filter="removeUrlFilter"
    @edit="handleRowEdit"
  >
    <template v-if="liveHold.reason.value" #notice>
      <LiveHoldBanner
        :count="liveHold.newCount.value"
        :reason="liveHold.reason.value"
        :missed-label="liveHold.missedLabel"
        :detail="liveHold.missedDetail.value"
        @show="liveHold.showNew"
      />
    </template>
    <!-- What came in while the rows were read or the page paused: a pill
         over the first rows, under the column header band (the table sets
         its height; a sticky one stays put above a scrolled area, so the pill
         stays under it), taking no room, so the rows stay where they are.
         Above the pinned columns and the presence rail it overlaps. -->
    <template v-else-if="liveHold.newCount.value > 0" #notice>
      <div class="relative z-30 h-0">
        <div
          class="pointer-events-none absolute inset-x-0 top-[calc(var(--dms-table-head-height,0px)+0.5rem)] flex justify-center px-4"
        >
          <LiveHoldBanner
            floating
            class="pointer-events-auto"
            :count="liveHold.newCount.value"
            :missed-label="liveHold.missedLabel"
            :detail="liveHold.missedDetail.value"
            @show="liveHold.showNew"
          />
        </div>
      </div>
    </template>
    <template v-if="hasViews" #views>
      <TableViews
        :items="viewItems"
        :active-id="activeViewId"
        :layout="viewsLayout"
        :modified="isViewModified"
        :can-save-as="canSaveViews"
        :divided="tabsWithCount.length === 0"
        @open="selectView"
        @reset="resetView"
        @save="saveView"
        @save-as="saveAsNewView"
        @delete="deleteView"
      />
    </template>
    <template v-if="expandableConfig" #expanded="{ row }">
      <ExpandedRowDetail
        :row-props="expandedRowProps(row.original)"
        :config="expandableConfig"
        :load-state="expandedRowLoadState(row.id)"
        @retry="expandedDetails.load(row.id)"
      />
    </template>
    <template
      v-if="activeDisplayComponent && !activeDisplayBlockedByError"
      #body="{ table }"
    >
      <component
        :is="activeDisplayComponent"
        ref="activeDisplayRef"
        :context="contextForSlot(table)"
      />
    </template>
  </UTable>
</template>
