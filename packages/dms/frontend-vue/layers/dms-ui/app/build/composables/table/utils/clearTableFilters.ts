import type { Ref } from "vue";
import type { PaginationState } from "@tanstack/vue-table";
import type { TableFilter } from "../../../components/table/Table.vue";
import { isFilterEffective } from "../../table-view/utils/tableQuery";

// Everything that narrows a table's rows — filter chips, the toolbar search
// and the quick filters — cleared in one go. The "clear all" actions (empty
// state, filters row, filters popover) all go through `clearTableFilters`.
// Sort, page size, tab, display, group-by and the archive toggle are not
// filters: they stay as they are.

export interface TableNarrowingState {
  columnFilters: Ref<TableFilter[]>;
  /** The toolbar search text. */
  globalFilter: Ref<string | undefined>;
  quickFilterValues?: Ref<Record<string, string | undefined>>;
  /** Sent back to the first page after a clear. */
  pagination?: Ref<PaginationState>;
  /**
   * The active display applies the search (true by default); an ignored
   * search neither narrows the rows nor needs offering to clear.
   */
  searchApplies?: Ref<boolean>;
}

/** What a clear would change. */
export interface ClearableTableFilters {
  /** Filter chips or quick filters. */
  filters: boolean;
  search: boolean;
}

const sameValue = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The filter chips once cleared: a pinned (default) filter goes back to its
 * initial value, any other chip is dropped.
 */
export const resetColumnFilters = (filters: TableFilter[]): TableFilter[] =>
  filters
    .filter((filter) => filter.pinned)
    .map((filter) => ({ ...filter, value: filter.initialValue }));

const hasClearableColumnFilters = (filters: TableFilter[]): boolean =>
  filters.some((filter) =>
    filter.pinned ? !sameValue(filter.value, filter.initialValue) : true,
  );

const hasQuickFilterValues = (
  values: Record<string, string | undefined> | undefined,
): boolean =>
  Object.values(values ?? {}).some(
    (value) => value !== undefined && value !== "",
  );

const hasSearch = (state: TableNarrowingState): boolean =>
  !!state.globalFilter.value && (state.searchApplies?.value ?? true);

export const clearableTableFilters = (
  state: TableNarrowingState,
): ClearableTableFilters => ({
  filters:
    hasClearableColumnFilters(state.columnFilters.value) ||
    hasQuickFilterValues(state.quickFilterValues?.value),
  search: hasSearch(state),
});

/** The rows are narrowed by a search, a filter chip or a quick filter. */
export const isTableNarrowed = (state: TableNarrowingState): boolean =>
  hasSearch(state) ||
  state.columnFilters.value.some(isFilterEffective) ||
  hasQuickFilterValues(state.quickFilterValues?.value);

/** i18n key of a clear action, naming what it clears. */
export const clearTableFiltersLabelKey = (
  clearable: ClearableTableFilters,
): string =>
  clearable.filters && clearable.search
    ? "dms.table.clear_filters_and_search"
    : clearable.search
      ? "dms.table.clear_search"
      : "dms.table.clear_filters";

export const clearTableFilters = (state: TableNarrowingState): void => {
  state.columnFilters.value = resetColumnFilters(state.columnFilters.value);
  state.globalFilter.value = "";
  if (state.quickFilterValues) state.quickFilterValues.value = {};
  if (state.pagination && state.pagination.value.pageIndex !== 0) {
    state.pagination.value = { ...state.pagination.value, pageIndex: 0 };
  }
};
