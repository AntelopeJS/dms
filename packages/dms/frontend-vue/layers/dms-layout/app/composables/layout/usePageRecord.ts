import { computed, type ComputedRef } from "vue";
import { resolveUrlVariables } from "#dms-ui/app/build/utils/urlVariables";
import type { PageRecord } from "../../utils/pageRecord";

/** The record a page shows, as the layout declares it (`record`). */
export interface PageRecordSource {
  /** `{{params.X}}` and `{{query.X}}` are filled in from the page URL. */
  fetchUrl: string;
}

/**
 * The record the page shows, for the header buttons acting on it: loading
 * until it answers, missing when it does not, or when its URL names a value
 * the page does not carry. Undefined for a page declaring no record.
 *
 * It is read through `useApiData`, keyed on its URL like a block's
 * `fetchUrl`: a block of the page reading the same URL shares the one
 * request, and a server render hands the record to the browser with the page.
 */
export function usePageRecord(
  source: () => PageRecordSource | undefined,
): ComputedRef<PageRecord | undefined> {
  const route = useDmsRoute();
  const siteLayout = useSiteLayout();

  // Null while the URL names a value the page does not carry.
  const url = computed(() => {
    const declared = source();
    if (!declared) return undefined;
    return (
      resolveUrlVariables(declared.fetchUrl, {
        routeParams: siteLayout.findMatchingRoute(route.path)?.params,
        routeQuery: route.query as Record<string, unknown>,
      }) ?? null
    );
  });
  // The options a block's read takes (`useChartFetch`): a block never holds
  // a navigation, and neither does the header.
  const { data, error } = useApiData<Record<string, unknown>>(
    () => url.value ?? null,
    { lazy: true },
  );

  return computed<PageRecord | undefined>(() => {
    if (url.value === undefined) return undefined;
    if (url.value === null || error.value) return { status: "missing" };
    if (data.value) return { status: "loaded", values: data.value };
    return { status: "loading" };
  });
}
