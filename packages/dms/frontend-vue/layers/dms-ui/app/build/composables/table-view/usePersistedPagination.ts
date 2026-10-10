import type { PaginationState } from "@tanstack/vue-table";
import { computed, ref, watch, type Ref } from "vue";

const FIRST_PAGE_INDEX = 0;
const PAGINATION_PREFERENCE = "pagination";
// The hidden filters the stored page was reached under, next to it.
const PAGINATION_SCOPE_PREFERENCE = "paginationScope";

/** The preference store the page is kept in (`usePreferences`). */
export interface PaginationPreferences {
  getPreference: <V>(keyPath: string, defaultValue?: V) => V;
  setPreference: (keyPath: string, value: unknown) => void;
}

export interface PersistedPaginationOptions {
  preferences: PaginationPreferences;
  /** The table's preference key of a setting. */
  preferenceKey: (suffix: string) => string;
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
 * The table's page, kept in the user's preferences with the hidden filters
 * it was reached under. A page restored under other hidden filters (a link
 * that remounted the page with another `?status=`) starts at the first
 * page, as does a change of their value while the table is shown; compared
 * by value, so another query parameter changing keeps the page.
 */
export function usePersistedPagination(
  options: PersistedPaginationOptions,
): Ref<PaginationState> {
  const { preferences, preferenceKey } = options;
  const scopeKey = computed(() => JSON.stringify(options.scope() ?? null));
  const stored = preferences.getPreference<PaginationState>(
    preferenceKey(PAGINATION_PREFERENCE),
    options.defaults,
  );
  // A page stored before its scope was: kept, as it always was.
  const storedScope = preferences.getPreference<string>(
    preferenceKey(PAGINATION_SCOPE_PREFERENCE),
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
      preferences.setPreference(preferenceKey(PAGINATION_PREFERENCE), value);
      preferences.setPreference(
        preferenceKey(PAGINATION_SCOPE_PREFERENCE),
        scope,
      );
    },
    { deep: true },
  );

  return pagination;
}
