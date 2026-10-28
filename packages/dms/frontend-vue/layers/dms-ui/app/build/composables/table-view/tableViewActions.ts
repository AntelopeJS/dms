import { get } from "@nuxt/ui/runtime/utils/index.js";
import { useTableRowActions } from "./useTableViewRowActions";

import type { TableViewScope } from "./tableViewScope";

export function useTableViewRowActions<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "rows"
    | "refresh"
    | "rowNavigation"
    | "listState"
    | "rowLocator"
    | "arrival"
    | "props"
    | "deferred"
  >,
) {
  const {
    componentId,
    location,
    allColumns,
    caption,
    labelKey,
    formComponents,
    formContainer,
    formPages,
    routeParams,
    pageId,
    queryParamFilters,
    ROW_ID_DEFAULT_KEY,
  } = scope.configuration;
  const { $authFetch, tableRows } = scope.rows;
  const { refreshAfterWrite } = scope.refresh;
  const {
    navigableRows,
    listsServerPages,
    loadedRowsOffset,
    loadAdjacentRows,
  } = scope.rowNavigation;
  const { shownData } = scope.listState;
  const { locateRow } = scope.rowLocator;
  const { urlScope } = scope.arrival;
  const { props } = scope;
  const { deferred } = scope;
  const { exportTable } = useTableViewExport({ componentId });
  const {
    openRow,
    openRowById,
    editRow,
    newRow,
    duplicateRow,
    deleteRows: deleteRowsAction,
    archiveRows: archiveRowsAction,
    restoreRows: restoreRowsAction,
    handleCustomButton,
    handleCustomRowAction,
    handleBulkCustomAction,
    handleMissingRow,
    runConfirmedBuiltIn,
  } = useTableRowActions<T>({
    api: $authFetch,
    location,
    columns: allColumns,
    caption,
    labelKey,
    rowIdKey: props.rowIdKey,
    refreshCallback: refreshAfterWrite,
    formComponents,
    formContainer,
    formPages,
    routeParams,
    componentId: componentId!,
    pageId: pageId!,
    queryParamFilters,
    rowNavigation: {
      rows: navigableRows,
      rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
      getRow: (id) => tableRows.getRow(id),
      total: () =>
        listsServerPages.value
          ? (shownData.value?.total ?? undefined)
          : undefined,
      offset: loadedRowsOffset,
      loadAdjacent: loadAdjacentRows,
      locate: locateRow,
    },
    recordScope: urlScope,
    onRecordShown: (id) => deferred.recordLink?.shown(id),
  });
  return {
    handleBulkCustomAction,
    deleteRowsAction,
    archiveRowsAction,
    restoreRowsAction,
    exportTable,
    runConfirmedBuiltIn,
    openRow,
    duplicateRow,
    newRow,
    editRow,
    handleCustomRowAction,
    handleMissingRow,
    handleCustomButton,
    openRowById,
  };
}

export function useTableViewRowCommands<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "tabs"
    | "urlFilters"
    | "rowActions"
    | "filterState"
    | "deferred"
  >,
) {
  const { enableTableExport, tableProps, archiveMode } = scope.configuration;
  const { t } = scope.tabs;
  const { rowSelect } = scope.urlFilters;
  const { deleteRowsAction, archiveRowsAction, restoreRowsAction } =
    scope.rowActions;
  const { showArchived } = scope.filterState;
  const { deferred } = scope;
  const customNavItems = computed(() => {
    const items = [];

    if (enableTableExport) {
      items.push({
        label: t("dms.button.export_data"),
        icon: "i-ph-export",
        onSelect: () => deferred.handleExportTable(),
      });
    }

    return items;
  });

  const deselectRows = (ids: string[]) => {
    const removed = new Set(ids);
    rowSelect.value = Object.fromEntries(
      Object.entries(rowSelect.value).filter(([id]) => !removed.has(id)),
    );
  };

  const deleteRows = async (ids: string[], rows?: T[]) => {
    const done = await deleteRowsAction(
      ids,
      tableProps.value.rowActions?.delete,
      {
        permanently: !!archiveMode && showArchived.value,
        rows,
      },
    );
    if (done) deselectRows(ids);
  };

  const archiveRows = async (ids: string[]) => {
    if (await archiveRowsAction(ids, tableProps.value.rowActions?.archive)) {
      deselectRows(ids);
    }
  };

  const restoreRows = async (ids: string[]) => {
    if (await restoreRowsAction(ids, tableProps.value.rowActions?.restore)) {
      deselectRows(ids);
    }
  };
  return { deselectRows, deleteRows, customNavItems, archiveRows, restoreRows };
}

export function useTableViewRowOpen<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "rowActions"
    | "configuration"
    | "query"
    | "listState"
    | "queryFilters"
    | "props"
  >,
) {
  const { exportTable, runConfirmedBuiltIn, openRow, duplicateRow, newRow } =
    scope.rowActions;
  const { location, tableProps, ROW_ID_DEFAULT_KEY } = scope.configuration;
  const { queryRequest, archiveQuery } = scope.query;
  const { shownResults } = scope.listState;
  const { queryParamDefaults } = scope.queryFilters;
  const { props } = scope;
  const handleExportTable = () =>
    exportTable(location, { ...queryRequest.value, ...archiveQuery.value });
  const handleExportSelection = (ids: string[]) =>
    exportTable(location, queryRequest.value, ids);

  const rowActionConfig = (key: "details" | "duplicate" | "add" | "edit") =>
    tableProps.value.rowActions?.[key];
  const handleRowClick = (item: T) =>
    runConfirmedBuiltIn(rowActionConfig("details"), item, () => openRow(item));

  const handleRowDuplicate = (itemId: string) => {
    const idKey = props.rowIdKey ?? ROW_ID_DEFAULT_KEY;
    const shown = shownResults.value?.find(
      (row) => String(get(row, idKey)) === itemId,
    );
    return runConfirmedBuiltIn(
      rowActionConfig("duplicate"),
      shown ?? { [idKey]: itemId },
      () => duplicateRow(itemId),
    );
  };
  const handleRowAdd = () =>
    runConfirmedBuiltIn(rowActionConfig("add"), undefined, () =>
      newRow(queryParamDefaults.value),
    );
  return {
    handleExportTable,
    rowActionConfig,
    handleRowClick,
    handleRowAdd,
    handleRowDuplicate,
    handleExportSelection,
  };
}

export function useTableViewRowEdit<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "rowRealtime"
    | "presenceEvents"
    | "rowActions"
    | "rowOpen"
    | "queryFilters"
    | "footer"
    | "bulkSelection"
    | "urlFilters"
  >,
) {
  const { getRowId } = scope.rowRealtime;
  const { otherEditorsForRow } = scope.presenceEvents;
  const { runConfirmedBuiltIn, editRow } = scope.rowActions;
  const { rowActionConfig } = scope.rowOpen;
  const { queryParamDefaults } = scope.queryFilters;
  const { baseQuery } = scope.footer;
  const { allMatching } = scope.bulkSelection;
  const { rowSelect } = scope.urlFilters;
  const { warnBeforeEdit } = usePresenceEditWarning();

  const handleRowEdit = async (item: T) => {
    const itemId = getRowId(item);
    if (itemId) {
      const others = otherEditorsForRow(itemId);
      if (others.length > 0 && !(await warnBeforeEdit(others))) return;
    }
    return runConfirmedBuiltIn(rowActionConfig("edit"), item, () =>
      editRow(item, queryParamDefaults.value),
    );
  };

  const EMPTY_ITEMS: T[] = [];

  watch(
    baseQuery,
    () => {
      allMatching.value = false;
    },
    { deep: true },
  );
  watch(rowSelect, (selection) => {
    if (Object.keys(selection).length === 0) allMatching.value = false;
  });
  return { handleRowEdit, EMPTY_ITEMS };
}
