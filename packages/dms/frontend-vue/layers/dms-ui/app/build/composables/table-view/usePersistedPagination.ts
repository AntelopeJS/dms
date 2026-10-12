import type { PaginationState } from "@tanstack/vue-table";
import { computed, ref, watch, type Ref } from "vue";
import { hashText } from "#dms-core/app/build/composables/user/tablePreferences";
import type { TablePreferences } from "./useTablePreferences";

const FIRST_PAGE_INDEX = 0;

export interface PersistedPaginationOptions {
  /** The table's preferences (`useTablePreferences`). */
  preferences: TablePreferences;
  defaults: PaginationState;
  /**
   * What lists other rows without the user picking it: the hidden filters
   * the page URL sets. A change of value lists from the first page.
   */
  scope: () => unknown;
}

const firstPage = (pagination: PaginationState): PaginationState => ({
  ...pagination,
  pageIndex: FIRST_PAGE_INDEX,
});

/**
 * The table's page, kept in the user's preferences with a hash of the hidden
 * filters it was reached under (only past the first page, where it matters). A page restored under other hidden filters (a link
 * that remounted the page with another `?status=`) starts at the first
 * page, as does a change of their value while the table is shown; compared
 * by value, so another query parameter changing keeps the page.
 */
export function usePersistedPagination(
  options: PersistedPaginationOptions,
): Ref<PaginationState> {
  const { preferences, defaults } = options;
  const scopeKey = computed(() =>
    hashText(JSON.stringify(options.scope() ?? null)),
  );
  const stored = preferences.get<PaginationState>("pagination", defaults);
  // A page kept without its scope (the first one): kept as it is.
  const storedScope = preferences.get<string>(
    "paginationScope",
    scopeKey.value,
  );
  const pagination = ref<PaginationState>(
    storedScope === scopeKey.value ? stored : firstPage(stored),
  );

  // Synchronous, so the list is queried once, with both changes.
  watch(
    scopeKey,
    () => {
      if (pagination.value.pageIndex === FIRST_PAGE_INDEX) return;
      pagination.value = firstPage(pagination.value);
    },
    { flush: "sync" },
  );
  watch(
    [pagination, scopeKey],
    ([value, scope]) => {
      preferences.set("pagination", value, defaults);
      const isFirstPage = value.pageIndex === FIRST_PAGE_INDEX;
      preferences.set<string | undefined>(
        "paginationScope",
        isFirstPage ? undefined : scope,
        undefined,
      );
    },
    { deep: true },
  );

  return pagination;
}
