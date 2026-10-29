import type { PaginationState, SortingState } from "@tanstack/vue-table";
import type { TableViewDisplayContext } from "../../../composables/table-view/types";
import type { ComputedRef, Ref } from "vue";
import { useRefreshTriggers } from "../blocks/useRefreshTriggers";
import { useTableRecordLink } from "./useTableRecordLink";
import { useTableListData } from "./useTableListData";
export interface TableViewDeferred<T extends Data> {
  activeViewId: Ref<string | undefined>;
  activeTabId: Ref<string>;
  columnFilters: Ref<TableFilter[]>;
  sorting: Ref<SortingState>;
  defaultSortState: SortingState;
  paginationState: Ref<PaginationState>;
  DEFAULT_PAGINATION: PaginationState;
  router: ReturnType<typeof useDmsRouter>;
  isGroupedDisplay: ComputedRef<boolean>;
  liveGate: ReturnType<typeof useRefreshTriggers>;
  data: ReturnType<typeof useTableListData<T>>["data"];
  refreshCounts: () => Promise<void>;
  recordLink: ReturnType<typeof useTableRecordLink<T>> | undefined;
  selectedIds: ComputedRef<string[]>;
  handleExportTable: () => ReturnType<
    ReturnType<typeof useTableViewExport>["exportTable"]
  >;
  displayContext: ComputedRef<TableViewDisplayContext<T>>;
}
