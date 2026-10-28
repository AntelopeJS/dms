import { buildTableQuery } from "./utils/tableQuery";
import { isSameSorting } from "./utils/sortableColumns";
import {
  rowSidePanelOwnerKey,
  useRowSidePanelContent,
} from "#dms-ui/app/build/composables/layout/rowSidePanel";
import { useTemplateRef, type ComponentPublicInstance } from "vue";
import { useRefreshTriggers } from "../blocks/useRefreshTriggers";
import { refreshPageBlocks } from "../../../utils/blockRefresh";
import { useTableLiveHold } from "./useTableLiveHold";
import { useTableDataChanges } from "../../../composables/table-view/useTableDataChanges";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewLiveHold<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "rows"
    | "querySorting"
    | "defaultSorting"
    | "queryFilters"
    | "query"
    | "props"
    | "deferred"
  >,
) {
  const { pageId, componentId } = scope.configuration;
  const { tableRows } = scope.rows;
  const { effectiveGlobalFilter, effectiveSorting, effectiveColumnFilters } =
    scope.querySorting;
  const { defaultSortState } = scope.defaultSorting;
  const { hiddenFilters } = scope.queryFilters;
  const { archiveQuery } = scope.query;
  const { props } = scope;
  const { deferred } = scope;
  const rowSidePanel = useRowSidePanelContent();
  const rowSidePanelOwner = rowSidePanelOwnerKey(pageId!, componentId!);
  const openRowId = computed(() =>
    rowSidePanel.value?.ownerKey === rowSidePanelOwner
      ? rowSidePanel.value.rowKey
      : undefined,
  );

  const NEW_ROWS_COUNT_ID = "liveHold:new";
  const tableRoot = useTemplateRef<ComponentPublicInstance>("tableRoot");
  const liveHold = useTableLiveHold({
    liveHold: props.liveHold,
    isSource: tableRows.isSource,
    gate: () => deferred.liveGate,
    signals: {
      isRowOpen: () => openRowId.value !== undefined,
      isSearching: () => !!effectiveGlobalFilter.value,
      isSorted: () => !isSameSorting(effectiveSorting.value, defaultSortState),
      tableElement: () => tableRoot.value?.$el ?? null,
    },

    newRows: {
      heldList: () => deferred.data.value,
      countNow: async (signal) => {
        const counts = await tableRows.countBatch(
          [
            {
              id: NEW_ROWS_COUNT_ID,
              query: {
                ...buildTableQuery({
                  pagination: { pageIndex: 0, pageSize: 0 },
                  sorting: [],
                  columnFilters: effectiveColumnFilters.value,
                  hiddenFilters: hiddenFilters.value,
                  globalFilter: effectiveGlobalFilter.value,
                }),
                ...archiveQuery.value,
              },
            },
          ],
          signal,
        );
        return counts[NEW_ROWS_COUNT_ID];
      },
    },
  });
  return { liveHold, openRowId, tableRoot };
}

export function useTableViewRefresh<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "countsData"
    | "linkCounts"
    | "grouping"
    | "footer"
    | "listState"
    | "props"
  >,
) {
  const { location } = scope.configuration;
  const { refreshTabCounts } = scope.countsData;
  const { refreshLinkTabCounts } = scope.linkCounts;
  const { refreshGroupCounts } = scope.grouping;
  const { refreshSummaries, activeDisplayRef } = scope.footer;
  const { refresh } = scope.listState;
  const { props } = scope;
  const { notifyTableDataChanged } = useTableDataChanges();
  const refreshCounts = async () => {
    notifyTableDataChanged(location);
    await Promise.all([
      refreshTabCounts(),
      refreshLinkTabCounts(),
      refreshGroupCounts(),
      refreshSummaries(),
    ]);
  };
  const refreshAll = async () => {
    await Promise.all([
      refresh(),
      refreshCounts(),
      activeDisplayRef.value?.refresh?.(),
    ]);
  };

  const liveGate = useRefreshTriggers(props.realtimeTopic, () => refreshAll());

  const refreshByUser = () => {
    liveGate.acknowledge();
    return refreshAll();
  };

  const refreshAfterWrite = () => refreshPageBlocks();
  return {
    liveGate,
    refreshCounts,
    refreshAfterWrite,
    refreshAll,
    refreshByUser,
  };
}
