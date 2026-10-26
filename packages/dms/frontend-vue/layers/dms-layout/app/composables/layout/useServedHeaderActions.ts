import {
  computed,
  onScopeDispose,
  shallowRef,
  watch,
  type ComputedRef,
} from "vue";
import { onPageBlocksRefresh } from "#dms-ui/app/utils/blockRefresh";
import type { LayoutHeaderAction } from "../../build/components/layout/PageHeaderActionBar.vue";
import type { PageLayout } from "#dms-core/app/types/page";
import {
  isSamePageQuery,
  isSameRouteParams,
  fillRouteParams,
  layoutUrlWithQuery,
  pageQueryValues,
} from "#dms-core/app/utils/pageQuery";

interface ServedHeaderActionsOptions {
  /** The buttons the page layout was served with. */
  actions: () => LayoutHeaderAction[];
  /**
   * The page query they were served for, set when one of them declares an
   * `availability` or the page reads a `record` (`headerActionsQuery`).
   */
  servedQuery: () => Record<string, string> | undefined;
  /** The route parameters (`:id`) their availability was resolved for. */
  servedParams?: () => Record<string, string> | undefined;
}

/**
 * The page header's buttons for the page query of the moment. A button whose
 * `availability` depends on the query (`?workspace=` names the record the
 * page acts on) was resolved for the query the layout was loaded with: when
 * the URL's query moves away from it, the header asks the page layout again
 * for that query and takes its buttons, keeping the last ones meanwhile. The
 * same goes for the route parameters: the layout of `/projects/project/:id`
 * is cached once for the page, whichever record it was first served for.
 * A write on the page (`refreshPageBlocks()`, after a header button or a
 * form) asks again too: it may have changed the record the buttons read, or
 * what their availability checks. Buttons without an availability, on a page
 * reading no record, never cause a request.
 */
export function useServedHeaderActions({
  actions,
  servedQuery,
  servedParams = () => undefined,
}: ServedHeaderActionsOptions): ComputedRef<LayoutHeaderAction[]> {
  const route = useDmsRoute();
  const siteLayout = useSiteLayout();
  const refreshed = shallowRef<LayoutHeaderAction[] | null>(null);
  let latestRequest = 0;

  const pageRoute = () => siteLayout.findMatchingRoute(route.path);

  async function askFor(url: string, query: Record<string, string>) {
    const request = ++latestRequest;
    const { $authFetch } = useAuthFetch();
    // prettier-ignore
    try {
      const layout = await $authFetch<PageLayout>(
        layoutUrlWithQuery(url, query),
      );
      if (request !== latestRequest) return;
      const options: { headerActions?: LayoutHeaderAction[] } | undefined =
        layout.layout.options;
      refreshed.value = options?.headerActions ?? [];
    } catch {
      // eslint-disable-line no-empty -- A failed refresh retains prior buttons; availability is not authorization, so target operations must enforce their own access checks.
    }
  }

  function follow() {
    const served = servedQuery();
    const current = pageQueryValues(route.query);
    const match = pageRoute();
    const layoutUrl = match?.metadata?.layoutUrl;
    const params = match?.params ?? {};
    const paramsServed = servedParams();
    if (
      !served ||
      !layoutUrl ||
      (isSamePageQuery(served, current) &&
        (!paramsServed || isSameRouteParams(paramsServed, params)))
    ) {
      latestRequest++;
      refreshed.value = null;
      return;
    }
    void askFor(fillRouteParams(layoutUrl, params), current);
  }

  function askAgain() {
    const layoutUrl = pageRoute()?.metadata?.layoutUrl;
    if (!servedQuery() || !layoutUrl) return;
    void askFor(
      fillRouteParams(layoutUrl, pageRoute()?.params ?? {}),
      pageQueryValues(route.query),
    );
  }

  if (!import.meta.env.SSR) {
    watch(
      [() => route.query, () => route.path, servedQuery, servedParams],
      follow,
      { immediate: true },
    );
    onScopeDispose(onPageBlocksRefresh(askAgain));
  }

  return computed(() => refreshed.value ?? actions());
}
