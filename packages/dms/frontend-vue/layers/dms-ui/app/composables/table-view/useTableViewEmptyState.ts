import { injectLocal } from "@vueuse/core";
import { computed, type ComputedRef, type ShallowRef } from "vue";
import type {
  Data,
  TableSharedData,
} from "../../build/components/table/Table.vue";

/** What narrows a table's rows, and the ways out, for its empty state. */
export interface TableViewEmptyStateControls {
  /** The text searched, empty when none. */
  search: ComputedRef<string>;
  /** A search, a filter chip, a quick filter or a URL filter narrows the rows. */
  isFiltered: ComputedRef<boolean>;
  /** A search narrows the rows: `clearSearch` has something to clear. */
  canClearSearch: ComputedRef<boolean>;
  /** A filter chip (a quick filter's included) narrows the rows. */
  canClearFilters: ComputedRef<boolean>;
  /** Empties the search, as the table's own "Clear search" does. */
  clearSearch: () => void;
  /** Clears the filter chips (pinned ones back to their value), the search kept. */
  clearFilters: () => void;
  /** Clears both, as the table's "Clear filters and search" does. */
  clearAll: () => void;
  /** Lists the rows again. */
  refresh: () => void;
}

/**
 * The search and filters of the table a component is drawn in, for a custom
 * empty state (`emptyStates.*.component`) or anything else inside the table:
 * offer "Clear search" and "Clear filters" without reading the table's
 * internals. A filter the page URL applies (`queryParamFilters`) counts in
 * `isFiltered` but is not the table's to clear: the page clears its own.
 *
 * Outside a table, nothing narrows and every action does nothing.
 *
 * ```ts
 * const { canClearSearch, clearSearch } = useTableViewEmptyState();
 * ```
 */
export function useTableViewEmptyState(): TableViewEmptyStateControls {
  const shared =
    injectLocal<ShallowRef<TableSharedData<Data>>>("tableSharedData");
  const table = () => shared?.value;
  return {
    search: computed(() => table()?.globalFilterState.value ?? ""),
    isFiltered: computed(() => !!table()?.isFiltered.value),
    canClearSearch: computed(() => !!table()?.clearableFilters.value.search),
    canClearFilters: computed(() => !!table()?.clearableFilters.value.filters),
    clearSearch: () => table()?.clearSearch(),
    clearFilters: () => table()?.clearFilters(),
    clearAll: () => table()?.resetFilters(),
    refresh: () => table()?.emits("refresh"),
  };
}
