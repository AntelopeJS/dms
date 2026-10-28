import { isString as isStringType } from "../../../../../dms-core/app/utils/type-check";
import type { Table } from "@tanstack/vue-table";
import type { TableViewDisplayContext } from "../../../composables/table-view/types";
import {
  resolveRowClickAction,
  rowCustomActions,
} from "../../../utils/rowClickAction";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewDisplayActions<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "urlFilters"
    | "rowEdit"
    | "rowOpen"
    | "configuration"
    | "rowActions"
    | "rowCommands"
    | "displaySelection"
  >,
) {
  const { paginationState } = scope.urlFilters;
  const { handleRowEdit } = scope.rowEdit;
  const { handleRowClick, handleRowAdd, handleRowDuplicate } = scope.rowOpen;
  const { tableProps } = scope.configuration;
  const { handleCustomRowAction } = scope.rowActions;
  const { deleteRows } = scope.rowCommands;
  const { isRowActionEnabled } = scope.displaySelection;
  const displayPagination = {
    setPage: (index: number) => {
      paginationState.value = { ...paginationState.value, pageIndex: index };
    },
    setPageSize: (size: number) => {
      paginationState.value = {
        ...paginationState.value,
        pageSize: size,
        pageIndex: 0,
      };
    },
  };

  const builtInRowClicks = {
    edit: handleRowEdit,
    details: handleRowClick,
  };
  const openDisplayItem = (item: T) => {
    const action = resolveRowClickAction(tableProps.value.rowActions, item);
    if (!action) return;
    if (isStringType(action)) {
      void builtInRowClicks[action](item);
      return;
    }
    handleCustomRowAction(action, item);
  };

  const displayRowActions = {
    add: handleRowAdd,
    edit: handleRowEdit,
    delete: deleteRows,
    duplicate: handleRowDuplicate,
    details: handleRowClick,
    open: openDisplayItem,
    custom: handleCustomRowAction,
    canEditRow: (item: T) =>
      isRowActionEnabled(tableProps.value.rowActions?.edit, item),
    canDeleteRow: (item: T) =>
      isRowActionEnabled(tableProps.value.rowActions?.delete, item),
    customFor: (item: T) =>
      rowCustomActions(tableProps.value.rowActions?.custom, item),
  };
  return { displayPagination, displayRowActions };
}

export function useTableViewDisplayContext<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "listState"
    | "rowEdit"
    | "displaySelection"
    | "urlFilters"
    | "displayActions"
    | "query"
    | "footer"
    | "configuration"
    | "presenceEvents"
    | "rowRealtime"
    | "displayOptions"
    | "refresh"
    | "rowNavigation"
    | "reorder"
    | "props"
  >,
) {
  const { shownResults, isListLoading, isFirstPageLoading, data } =
    scope.listState;
  const { EMPTY_ITEMS } = scope.rowEdit;
  const { selectedIds, displaySelection } = scope.displaySelection;
  const { paginationState } = scope.urlFilters;
  const { displayPagination, displayRowActions } = scope.displayActions;
  const { paginationMode } = scope.query;
  const { hasMoreRows, loadMoreRows, baseQuery } = scope.footer;
  const { tableProps, labelKey, location, componentId, pageId } =
    scope.configuration;
  const { presenceByRowFiltered } = scope.presenceEvents;
  const { rowIdKey } = scope.rowRealtime;
  const { optionsForDisplay, activeDisplayId } = scope.displayOptions;
  const { refreshByUser } = scope.refresh;
  const { setSelfManagedRows } = scope.rowNavigation;
  const { reorderState } = scope.reorder;
  const { props } = scope;
  const displayTable = shallowRef<Table<T>>();
  const captureDisplayTable = (table: Table<T>) => {
    if (displayTable.value !== table) displayTable.value = table;
  };

  const displayContext = computed(
    (): TableViewDisplayContext<T> => ({
      items: shownResults.value ?? EMPTY_ITEMS,
      columns: props.columns,
      loading: isListLoading.value,
      firstPageLoading: isFirstPageLoading.value,
      selection: { ids: selectedIds.value, ...displaySelection },
      pagination: {
        pageIndex: paginationState.value.pageIndex,
        pageSize: paginationState.value.pageSize,
        total: data.value?.total ?? 0,
        ...displayPagination,
        mode: paginationMode,
        hasMore: hasMoreRows.value,
        loadMore: loadMoreRows,
      },
      actions: {
        canAdd: isActionEnabled(tableProps.value.rowActions?.add),
        canEdit: isActionEnabled(tableProps.value.rowActions?.edit),
        canDelete: isActionEnabled(tableProps.value.rowActions?.delete),
        canDetails: isActionEnabled(tableProps.value.rowActions?.details),
        ...displayRowActions,
      },
      presenceByRow: presenceByRowFiltered.value,
      rowIdKey,
      labelKey,
      location,
      query: baseQuery.value,
      componentId,
      pageId,
      options: optionsForDisplay(activeDisplayId.value),
      refresh: refreshByUser,
      setShownRows: setSelfManagedRows,
      reorder: reorderState.value,
      table: displayTable.value,
    }),
  );

  const contextForSlot = (table: Table<T>): TableViewDisplayContext<T> => {
    captureDisplayTable(table);
    return displayContext.value;
  };
  return { displayContext, contextForSlot };
}
