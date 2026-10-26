import { computed, type Ref } from "vue";
import { createEventHook } from "@vueuse/core";
import type { Data, TableProps } from "./Table.types";
import {
  clearTableColumnFilters,
  clearTableFilters,
  clearTableSearch,
  clearableTableFilters,
  isTableNarrowed,
  type TableNarrowingState,
} from "../../composables/table/utils/clearTableFilters";

interface FilterStates {
  columnFiltersState: TableNarrowingState["columnFilters"];
  globalFilterState: TableNarrowingState["globalFilter"];
  paginationState: TableNarrowingState["pagination"];
  resolvedCapabilities: Ref<{ search: boolean }>;
}
export function useTableComponentFilters<T extends Data>(
  props: TableProps<T>,
  states: FilterStates,
) {
  const {
    columnFiltersState,
    globalFilterState,
    paginationState,
    resolvedCapabilities,
  } = states;
  const narrowingState: TableNarrowingState = {
    columnFilters: columnFiltersState,
    globalFilter: globalFilterState,
    pagination: paginationState,
    searchApplies: computed(() => resolvedCapabilities.value.search),
    hiddenFiltersApply: computed(() => !!props.hiddenFiltersApply),
  };
  const filtersCleared = createEventHook();
  const resetFilters = () => {
    clearTableFilters(narrowingState);
    void filtersCleared.trigger();
  };

  const clearSearch = () => {
    clearTableSearch(narrowingState);
    void filtersCleared.trigger();
  };
  const clearFilters = () => clearTableColumnFilters(narrowingState);
  const clearableFilters = computed(() =>
    clearableTableFilters(narrowingState),
  );
  const isFiltered = computed(() => isTableNarrowed(narrowingState));

  return {
    filtersCleared,
    resetFilters,
    clearSearch,
    clearFilters,
    clearableFilters,
    isFiltered,
  };
}
