import type { ExpandedState } from "@tanstack/vue-table";
import type { TableViewExpandedRowProps } from "../../../composables/table-view/types";
import {
  expandedRowsOnListing,
  type ExpandedRowMap,
  nextExpandedRows,
} from "./utils/expandedRows";
import { buildExpandedRowProps } from "./utils/expandedRowProps";
import {
  type ExpandedRowLoadState,
  useExpandedRowDetails,
} from "./useExpandedRowDetails";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewExpansion<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    "rowRealtime" | "listState" | "query" | "rows" | "props"
  >,
) {
  const { getRowId } = scope.rowRealtime;
  const { shownResults } = scope.listState;
  const { queryRequest, archiveQuery } = scope.query;
  const { tableRows } = scope.rows;
  const { props } = scope;
  const expandableConfig = props.expandable;
  const expanded = ref<ExpandedRowMap>({});

  const rowIdsOf = (rows: T[] | undefined): string[] =>
    (rows ?? []).map((row) => getRowId(row)).filter((id): id is string => !!id);

  const expandedModel = computed<ExpandedState>({
    get: () => expanded.value,
    set: (next) => {
      expanded.value = nextExpandedRows(
        expanded.value,
        next,
        rowIdsOf(shownResults.value),
        expandableConfig?.single,
      );
    },
  });

  let expandedListedKey: string | undefined;
  if (expandableConfig) {
    watch(
      shownResults,
      (rows) => {
        const next = expandedRowsOnListing(
          { expanded: expanded.value, listedKey: expandedListedKey },
          rows ? rowIdsOf(rows) : undefined,
          JSON.stringify([queryRequest.value, archiveQuery.value]),
          expandableConfig.defaultExpanded,
          expandableConfig.single,
        );
        expandedListedKey = next.listedKey;
        expanded.value = next.expanded;
      },
      { immediate: true },
    );
  }

  const expandedDetails = useExpandedRowDetails<T>((id) =>
    tableRows.getRow(id),
  );
  if (expandableConfig?.lazyLoad) {
    watch(shownResults, () => expandedDetails.reset());
    watch(
      [expanded, shownResults],
      () =>
        expandedDetails.ensure(
          Object.keys(expanded.value).filter((id) => expanded.value[id]),
        ),
      { immediate: true },
    );
  }
  return { expandableConfig, expandedDetails, expanded, expandedModel };
}

export function useTableViewExpandedDetails<T extends Data>(
  scope: Pick<TableViewScope<T>, "expansion" | "rowRealtime" | "deferred">,
) {
  const { expandableConfig, expandedDetails } = scope.expansion;
  const { getRowId } = scope.rowRealtime;
  const { deferred } = scope;
  const expandedRowLoadState = (id: string): ExpandedRowLoadState =>
    expandableConfig?.lazyLoad
      ? (expandedDetails.entryOf(id)?.state ?? "loading")
      : "ready";

  const expandedRowProps = (listed: T): TableViewExpandedRowProps<T> => {
    const id = getRowId(listed);
    const read = id ? expandedDetails.entryOf(id)?.row : undefined;
    return buildExpandedRowProps<T>(
      read ? { ...listed, ...read } : listed,
      deferred.displayContext.value,
    );
  };
  return { expandedRowLoadState, expandedRowProps };
}
