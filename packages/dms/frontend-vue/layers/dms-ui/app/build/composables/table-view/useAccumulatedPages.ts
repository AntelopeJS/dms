import type { PaginationState } from "@tanstack/vue-table";
import type { Ref, WatchSource } from "vue";
import type { TableViewPaginationMode } from "../../../composables/table-view/types";

const FIRST_PAGE_COUNT = 1;

export interface AccumulatedPagesOptions {
  mode: TableViewPaginationMode;
  pagination: Ref<PaginationState>;
  /** What lists other rows: a change starts over from the first page. */
  resetOn: WatchSource[];
}

/**
 * A list that grows by pages (`loadMore`, `infinite`) instead of paging: it
 * asks for every page loaded so far in one request, from the first row, so
 * a refresh or a realtime change re-reads the same rows. A new filter,
 * search, sort or tab starts over from one page.
 */
export function useAccumulatedPages(options: AccumulatedPagesOptions) {
  const isAccumulating = options.mode !== "pages";
  const loadedPages = ref(FIRST_PAGE_COUNT);

  const requestedPagination = computed<PaginationState>(() =>
    isAccumulating
      ? {
          pageIndex: 0,
          pageSize: options.pagination.value.pageSize * loadedPages.value,
        }
      : options.pagination.value,
  );

  watch(
    options.resetOn,
    () => {
      loadedPages.value = FIRST_PAGE_COUNT;
    },
    { deep: true },
  );

  const loadNextPage = () => {
    loadedPages.value += 1;
  };

  return { isAccumulating, requestedPagination, loadNextPage };
}
