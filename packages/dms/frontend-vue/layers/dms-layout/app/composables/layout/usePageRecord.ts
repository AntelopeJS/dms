import { computed, shallowRef, watch, type ComputedRef } from "vue";
import { resolveUrlVariables } from "#dms-ui/app/build/utils/urlVariables";
import type { PageRecord } from "../../utils/pageRecord";

/** The record a page shows, as the layout declares it (`record`). */
export interface PageRecordSource {
  /** `{{params.X}}` and `{{query.X}}` are filled in from the page URL. */
  fetchUrl: string;
}

/**
 * The record the page shows, read in the browser for the header buttons
 * acting on it: loading until it answers (as the server renders it, so
 * hydration matches), missing when it does not, or when its URL names a value
 * the page does not carry. Undefined for a page declaring no record.
 */
export function usePageRecord(
  source: () => PageRecordSource | undefined,
): ComputedRef<PageRecord | undefined> {
  const route = useDmsRoute();
  const siteLayout = useSiteLayout();
  const record = shallowRef<PageRecord>({ status: "loading" });
  let latestRequest = 0;

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

  async function read(resolved: string | null | undefined) {
    const request = ++latestRequest;
    if (resolved === undefined) return;
    if (resolved === null) {
      record.value = { status: "missing" };
      return;
    }
    record.value = { status: "loading" };
    const { $authFetch } = useAuthFetch();
    try {
      const values = await $authFetch<Record<string, unknown>>(resolved);
      if (request === latestRequest)
        record.value = { status: "loaded", values };
    } catch {
      if (request === latestRequest) record.value = { status: "missing" };
    }
  }

  if (!import.meta.env.SSR) watch(url, read, { immediate: true });

  return computed(() => (source() ? record.value : undefined));
}
