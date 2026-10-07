/** What decides which rows a table lists, paging and order aside. */
export interface SelectionScope {
  columnFilters: readonly unknown[];
  /** Filters the user does not edit: the active tab's, the URL's. */
  hiddenFilters: readonly unknown[];
  globalFilter?: string;
}

/**
 * A key that changes when the set of rows a table lists does: its filters,
 * its search or its tab. Paging and sorting move through the same set, so
 * they keep it.
 */
export function selectionScopeKey(scope: SelectionScope): string {
  return JSON.stringify([
    scope.columnFilters,
    scope.hiddenFilters,
    scope.globalFilter ?? "",
  ]);
}
