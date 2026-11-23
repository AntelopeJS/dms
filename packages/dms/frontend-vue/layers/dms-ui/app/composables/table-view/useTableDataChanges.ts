import { computed, type ComputedRef } from "vue";

/**
 * A version per data API location (`/api/tables/admin-invites`), moved on each
 * time a table view reads its rows again because they changed: a form saved,
 * a row action or a bulk action ran, a realtime event came in, or the user
 * refreshed it.
 *
 * Whatever summarises the same rows elsewhere — a navigation count, an
 * overview card — watches the version and reads its figure again, instead of
 * polling or waiting for the next page change.
 *
 * Shared state, so a table on one page and a count in the shell agree.
 */
export const useTableDataChanges = () => {
  const versions = useDmsState<Record<string, number>>(
    "dms-table-data-versions",
    () => ({}),
  );

  function notifyTableDataChanged(location: string | undefined): void {
    if (!location) return;
    versions.value = {
      ...versions.value,
      [location]: (versions.value[location] ?? 0) + 1,
    };
  }

  function tableDataVersion(locations: readonly string[]): ComputedRef<string> {
    return computed(() =>
      locations.map((location) => versions.value[location] ?? 0).join(":"),
    );
  }

  return { notifyTableDataChanged, tableDataVersion };
};
