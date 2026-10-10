import type { PaginationState } from "@tanstack/vue-table";
import { watch, type Ref } from "vue";

const FIRST_PAGE_INDEX = 0;

/**
 * Back to the first page when `source` changes value: the page reached among
 * the previous rows means nothing among the new ones. Compared by value, so
 * a recomputation to the same content (another query parameter changed)
 * keeps the page. Synchronous, so the list is queried once, with both
 * changes.
 */
export function useFirstPageOnChange(
  source: () => unknown,
  pagination: Ref<PaginationState>,
): void {
  watch(
    () => JSON.stringify(source() ?? null),
    () => {
      if (pagination.value.pageIndex === FIRST_PAGE_INDEX) return;
      pagination.value = { ...pagination.value, pageIndex: FIRST_PAGE_INDEX };
    },
    { flush: "sync" },
  );
}
