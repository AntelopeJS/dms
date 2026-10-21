import { computed, shallowRef, watch, type ComputedRef } from "vue";
import type { LayoutHeaderAction } from "../../build/components/layout/PageHeaderActionBar.vue";
import type { PageLayout } from "../../types/page";
import {
  isSamePageQuery,
  layoutUrlWithQuery,
  pageQueryValues,
} from "../../utils/pageQuery";

interface ServedHeaderActionsOptions {
  /** The buttons the page layout was served with. */
  actions: () => LayoutHeaderAction[];
  /**
   * The page query their availability was resolved for, set when one of them
   * declares an `availability` (`headerActionsQuery`).
   */
  servedQuery: () => Record<string, string> | undefined;
}

/**
 * The page header's buttons for the page query of the moment. A button whose
 * `availability` depends on the query (`?workspace=` names the record the
 * page acts on) was resolved for the query the layout was loaded with: when
 * the URL's query moves away from it, the header asks the page layout again
 * for that query and takes its buttons, keeping the last ones meanwhile.
 * Buttons without an availability never cause a request.
 */
export function useServedHeaderActions({
  actions,
  servedQuery,
}: ServedHeaderActionsOptions): ComputedRef<LayoutHeaderAction[]> {
  const route = useDmsRoute();
  const siteLayout = useSiteLayout();
  const refreshed = shallowRef<LayoutHeaderAction[] | null>(null);
  let latestRequest = 0;

  const layoutUrl = () =>
    siteLayout.findMatchingRoute(route.path)?.metadata?.layoutUrl;

  async function askFor(url: string, query: Record<string, string>) {
    const request = ++latestRequest;
    const { $authFetch } = useAuthFetch();
    try {
      const layout = await $authFetch<PageLayout>(
        layoutUrlWithQuery(url, query),
      );
      if (request !== latestRequest) return;
      const options = layout.layout.options as
        | { headerActions?: LayoutHeaderAction[] }
        | undefined;
      refreshed.value = options?.headerActions ?? [];
    } catch {
      // The buttons resolved for the previous query stay: the operation
      // behind each one still refuses on its own.
    }
  }

  function follow() {
    const served = servedQuery();
    const current = pageQueryValues(route.query as Record<string, unknown>);
    const url = layoutUrl();
    if (!served || !url || isSamePageQuery(served, current)) {
      latestRequest++;
      refreshed.value = null;
      return;
    }
    void askFor(url, current);
  }

  if (!import.meta.env.SSR) {
    watch([() => route.query, servedQuery], follow, { immediate: true });
  }

  return computed(() => refreshed.value ?? actions());
}
