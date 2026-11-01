import { router as inertiaRouter } from "@inertiajs/vue3";
import { layoutUrlWithQuery } from "../../utils/pageQuery";
import { onBeforeMount, toRaw } from "vue";
import { withoutTrailingSlash } from "ufo";

const STALE_THRESHOLD_MS = 300_000;
const SITE_LAYOUT_ENDPOINT = "/dms/sitelayout";
const RENDERED_SITE_LAYOUT_KEY = "dms-rendered-site-layout";
const IN_FLIGHT_SITE_LAYOUT_KEY = "__dmsInFlightSiteLayout";
const IN_FLIGHT_PAGE_LAYOUTS_KEY = "__dmsInFlightPageLayouts";

interface PageLayoutRequest {
  cache: Record<string, PageLayout>;
  promise: Promise<PageLayout>;
}

declare module "#dms/frontend-module" {
  interface DmsAppContext {
    [IN_FLIGHT_SITE_LAYOUT_KEY]?: Promise<boolean> | null;
    [IN_FLIGHT_PAGE_LAYOUTS_KEY]?: Map<string, PageLayoutRequest>;
  }
}

interface MatchRouteOptions {
  includeCategories: boolean;
}

const navigableCategoriesByLayout = new WeakMap<
  SiteLayout,
  Map<string, CategoryInfo>
>();

/** The category of the layout a URL resolves to, by its slug. */
export function findNavigableCategory(
  layout: SiteLayout,
  slug: string,
): CategoryInfo | undefined {
  let bySlug = navigableCategoriesByLayout.get(layout);
  if (!bySlug) {
    bySlug = new Map(
      Object.values(layout.categories)
        .filter((category) => !category.urlTransparent)
        .map((category) => [category.fullSlug, category]),
    );
    navigableCategoriesByLayout.set(layout, bySlug);
  }
  return bySlug.get(slug);
}

interface MatchRouteResult {
  pattern: string;
  metadata: PageInfo | CategoryInfo;
  params: Record<string, string>;
}

const OCCURRENCE_KEY_SEPARATOR = ":";

const occurrenceKey = (name: string, occurrence: number): string =>
  `${name}${OCCURRENCE_KEY_SEPARATOR}${occurrence}`;

function countByName(names: string[]) {
  const totals: Record<string, number> = {};
  for (const name of names) {
    totals[name] = (totals[name] ?? 0) + 1;
  }
  return totals;
}

function buildParamBag(names: string[], values: string[]) {
  const totals = countByName(names);
  const seen: Record<string, number> = {};
  const params: Record<string, string> = {};

  names.forEach((name, index) => {
    const value = values[index]!;
    const occurrence = (seen[name] ?? 0) + 1;
    seen[name] = occurrence;
    params[name] = value;
    if (totals[name]! > 1) {
      params[occurrenceKey(name, occurrence)] = value;
    }
  });

  return params;
}

export function extractRouteParams(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const segments = pattern.split("/");
  const regexPattern = segments
    .map((segment) => (segment.startsWith(":") ? "([^/]+)" : segment))
    .join("/");

  const match = path.match(new RegExp(`^${regexPattern}$`));
  if (!match) return null;

  const paramNames = segments
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.substring(1));

  return buildParamBag(paramNames, match.slice(1));
}

/**
 * A partial reload of the page on screen: the server sends the site layout
 * and the page fresh, and they replace the browser's copies, the layout
 * Inertia carries from page to page included. A failure rejects and leaves
 * the page as it is: Inertia would otherwise show the error in its place.
 */
function reloadSiteLayoutAndPage(): Promise<void> {
  return new Promise((resolve, reject) => {
    let failure: Error | undefined;
    inertiaRouter.reload({
      only: ["shared", "page"],
      onHttpException: (response) => {
        failure = new Error(`Site layout reload failed (${response.status})`);
        return false;
      },
      onNetworkError: (error) => {
        failure = error;
        return false;
      },
      onFinish: () => (failure ? reject(failure) : resolve()),
    });
  });
}

interface SiteLayoutResponse {
  siteLayout: SiteLayout;
  siteLayoutTree: SiteLayoutTree;
  quickActions: QuickActionsPayload;
  modules: Record<string, ModuleWithAccess>;
  isOwner: boolean;
}

/** The shared site layout, as a page's props or `/dms/sitelayout` set it. */
function useSiteLayoutState() {
  return {
    siteLayout: useDmsState<SiteLayout | undefined>(
      "dms-siteLayout",
      () => undefined,
    ),
    siteLayoutTree: useDmsState<SiteLayoutTree | undefined>(
      "dms-pageTree",
      () => undefined,
    ),
    quickActions: useDmsState<QuickActionsPayload | undefined>(
      "dms-quickActions",
      () => undefined,
    ),
    modules: useDmsState<Record<string, ModuleWithAccess> | undefined>(
      "dms-modules",
      () => undefined,
    ),
    isOwner: useDmsState<boolean>("dms-isOwner", () => false),
    lastRefreshTime: useDmsState<number>("dms-lastRefreshTime", () => 0),
  };
}

function applySiteLayoutResponse(
  state: ReturnType<typeof useSiteLayoutState>,
  result: SiteLayoutResponse,
): void {
  state.siteLayout.value = result.siteLayout;
  state.siteLayoutTree.value = result.siteLayoutTree;
  state.quickActions.value = result.quickActions;
  state.modules.value = result.modules;
  state.isOwner.value = result.isOwner;
  state.lastRefreshTime.value = Date.now();
}

function useSiteLayoutRequestsInFlight() {
  const dmsApp = useDmsApp();
  const pageLayoutPromises =
    dmsApp[IN_FLIGHT_PAGE_LAYOUTS_KEY] ?? new Map<string, PageLayoutRequest>();
  dmsApp[IN_FLIGHT_PAGE_LAYOUTS_KEY] = pageLayoutPromises;
  const loadingPromise = {
    get value(): Promise<boolean> | null {
      return dmsApp[IN_FLIGHT_SITE_LAYOUT_KEY] ?? null;
    },
    set value(promise: Promise<boolean> | null) {
      dmsApp[IN_FLIGHT_SITE_LAYOUT_KEY] = promise;
    },
  };
  return { pageLayoutPromises, loadingPromise };
}

const useSiteLayoutRequests = () => {
  const state = useSiteLayoutState();
  const consumeRefusal = useReadOnlyRefusal();
  const {
    siteLayout,
    siteLayoutTree,
    quickActions,
    modules,
    isOwner,
    lastRefreshTime,
  } = state;

  const isLoading = useDmsState<boolean>("dms-loading", () => false);
  const loadingError = useDmsState<string | null>("dms-error", () => null);

  const pageLayouts = useDmsState<Record<string, PageLayout>>(
    "dms-pageLayouts",
    () => ({}),
  );

  const { pageLayoutPromises, loadingPromise } =
    useSiteLayoutRequestsInFlight();

  const SITE_LAYOUT_ERROR_MESSAGE = "Error loading siteLayout";
  const UNKNOWN_SITE_LAYOUT_ERROR = "Unknown error loading siteLayout";
  const HTTP_INTERNAL_ERROR = 500;

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Fetch rejection values have no shared owner schema; an Error-only input would exclude malformed thrown values that intentionally use the fallback message.
  const handleSiteLayoutError = (error: unknown) => {
    if (consumeRefusal(error)) return;
    const errorMessage =
      error instanceof Error ? error.message : UNKNOWN_SITE_LAYOUT_ERROR;
    loadingError.value = errorMessage;
    showDmsError({
      statusCode: HTTP_INTERNAL_ERROR,
      statusMessage: SITE_LAYOUT_ERROR_MESSAGE,
      message: errorMessage,
    });
  };

  const requestSiteLayout = async (): Promise<boolean> => {
    const initialLayout = siteLayout.value;
    const initialCache = pageLayouts.value;

    const isCurrent = () =>
      siteLayout.value === initialLayout && pageLayouts.value === initialCache;
    const { $authFetch } = useAuthFetch();
    try {
      const result = await $authFetch<SiteLayoutResponse>(SITE_LAYOUT_ENDPOINT);
      if (isCurrent()) applySiteLayoutResponse(state, result);
      return true;
    } catch (error) {
      if (isCurrent()) handleSiteLayoutError(error);
      throw error;
    }
  };

  const startSiteLayoutFetch = (): Promise<boolean> => {
    const started = requestSiteLayout().finally(() => {
      isLoading.value = false;

      if (loadingPromise.value === started) loadingPromise.value = null;
    });
    return started;
  };

  const loadSiteLayout = async () => {
    if (loadingPromise.value) {
      return loadingPromise.value;
    }
    if (siteLayout.value) {
      return siteLayout.value;
    }

    isLoading.value = true;
    loadingError.value = null;
    loadingPromise.value = startSiteLayoutFetch();
    return loadingPromise.value;
  };

  function clearPageLayoutCaches() {
    pageLayouts.value = {};
  }

  const refresh = async () => {
    clearPageLayoutCaches();

    const inFlight = loadingPromise.value;
    if (inFlight) {
      await inFlight.catch(() => undefined);

      if (loadingPromise.value === inFlight) {
        loadingPromise.value = null;
      }
    }
    if (!loadingPromise.value) {
      isLoading.value = true;
      loadingError.value = null;
      loadingPromise.value = startSiteLayoutFetch();
    }
    await loadingPromise.value;
  };

  /**
   * Re-reads the menu and the page on screen from the server, for a change
   * the backend announced (a realtime menu invalidation) or a switch of
   * session. The pages prefetched on hover are dropped first: each carries
   * the layout and the access of before. A navigation that starts meanwhile
   * drops the reload's answer, and the page it opens still carries the layout
   * the reload meant to replace: that page is reloaded in turn.
   */
  const resync = async (): Promise<void> => {
    inertiaRouter.flushAll();
    const path = window.location.pathname;
    await reloadSiteLayoutAndPage();
    if (window.location.pathname !== path) await reloadSiteLayoutAndPage();
  };

  const refreshIfStale = async () => {
    const elapsed = Date.now() - lastRefreshTime.value;
    if (elapsed < STALE_THRESHOLD_MS) {
      return;
    }
    await refresh();
  };

  return {
    state,
    siteLayout,
    siteLayoutTree,
    quickActions,
    modules,
    isOwner,
    pageLayouts,
    pageLayoutPromises,
    isLoading,
    loadingError,
    loadSiteLayout,
    refresh,
    resync,
    refreshIfStale,
    clearPageLayoutCaches,
  };
};

function matchRoute(
  path: string,
  layout: SiteLayout,
  options: MatchRouteOptions,
): MatchRouteResult | null {
  const normalizedPath = withoutTrailingSlash(path) || "/";

  if (layout.pages[normalizedPath]) {
    return {
      pattern: normalizedPath,
      metadata: layout.pages[normalizedPath],
      params: {},
    };
  }

  const category = options.includeCategories
    ? findNavigableCategory(layout, normalizedPath)
    : undefined;
  if (category) {
    return { pattern: normalizedPath, metadata: category, params: {} };
  }

  for (const [pattern, metadata] of Object.entries(layout.pages)) {
    if (pattern.includes(":")) {
      const params = extractRouteParams(pattern, normalizedPath);
      if (params) {
        return {
          pattern,
          metadata,
          params,
        };
      }
    }
  }

  return null;
}

export const useSiteLayout = () => {
  const {
    state,
    siteLayout,
    siteLayoutTree,
    quickActions,
    modules,
    isOwner,
    pageLayouts,
    pageLayoutPromises,
    isLoading,
    loadingError,
    loadSiteLayout,
    refresh,
    resync,
    refreshIfStale,
    clearPageLayoutCaches,
  } = useSiteLayoutRequests();

  /**
   * The layout of a page, cached by its layout URL. `query` is the page
   * URL's, which the first request carries for the header buttons whose
   * availability reads it (the header asks again for another query).
   */
  /**
   * The layout of the page at `slug`, cached under it. `url`, the layout
   * route with the page's `:id` filled in, is what is asked when it differs.
   */
  const loadPageLayout = async (
    slug: string,
    query?: Record<string, string>,
    url = slug,
  ): Promise<PageLayout> => {
    if (pageLayouts.value[slug]) {
      return pageLayouts.value[slug];
    }

    const cache = pageLayouts.value;
    const pending = pageLayoutPromises.get(slug);
    if (pending?.cache === cache) {
      return pending.promise;
    }

    const { $authFetch } = useAuthFetch();
    const request = $authFetch<PageLayout>(
      layoutUrlWithQuery(url, query ?? {}),
    ).then((result) => {
      if (pageLayouts.value === cache) cache[slug] = result;
      return result;
    });
    pageLayoutPromises.set(slug, { cache, promise: request });

    try {
      return await request;
    } finally {
      if (pageLayoutPromises.get(slug)?.promise === request) {
        pageLayoutPromises.delete(slug);
      }
    }
  };

  const findMatchingRoute = (
    path: string,
  ): {
    pattern: string;
    metadata: PageInfo;
    params: Record<string, string>;
  } | null => {
    const layout = siteLayout.value;
    if (!layout) return null;

    // SAFETY: includeCategories false skips the category branch, so every non-null match takes metadata directly from layout.pages.
    return matchRoute(path, layout, {
      includeCategories: false,
    }) as ReturnType<typeof findMatchingRoute>;
  };

  const findMatchingRouteOrCategory = (
    path: string,
  ): {
    pattern: string;
    metadata: PageInfo | CategoryInfo;
    params: Record<string, string>;
  } | null => {
    const layout = siteLayout.value;
    if (!layout) return null;

    return matchRoute(path, layout, { includeCategories: true });
  };

  const probeAndCommitRoute = async (path: string): Promise<boolean> => {
    if (!import.meta.env.DEV) return false;
    const { $authFetch } = useAuthFetch();
    try {
      const result = await $authFetch<SiteLayoutResponse>(SITE_LAYOUT_ENDPOINT);

      if (
        matchRoute(path, result.siteLayout, { includeCategories: false }) ===
        null
      ) {
        return false;
      }
      clearPageLayoutCaches();
      applySiteLayoutResponse(state, result);
      return true;
    } catch {
      return false;
    }
  };

  return {
    siteLayout,
    siteLayoutTree,
    quickActions,
    modules,
    isOwner,
    pageLayouts,
    isLoading,
    loadingError,

    loadSiteLayout,
    loadPageLayout,
    refresh,
    resync,
    refreshIfStale,
    findMatchingRoute,
    findMatchingRouteOrCategory,
    probeAndCommitRoute,
  };
};

/**
 * The site layout for the component rendering it (the sidebar), called in
 * its setup. A page the backend describes brings it with its props; a page
 * only a frontend layer knows (a custom page) does not, and this loads it
 * with the page then: a server render waits for it before rendering the
 * component, and hands it to the browser, which takes it over before the
 * component mounts instead of asking again.
 */
export function useRenderedSiteLayout(): void {
  const state = useSiteLayoutState();
  if (state.siteLayout.value) return;
  const layout = useSiteLayout();

  const { data } = useApiData<SiteLayoutResponse | null>(
    RENDERED_SITE_LAYOUT_KEY,
    async () => {
      await layout.loadSiteLayout();
      const { siteLayout, siteLayoutTree, quickActions, modules, isOwner } =
        state;

      return siteLayout.value
        ? {
            siteLayout: toRaw(siteLayout.value),
            siteLayoutTree: toRaw(siteLayoutTree.value!),
            quickActions: toRaw(quickActions.value!),
            modules: toRaw(modules.value!),
            isOwner: isOwner.value,
          }
        : null;
    },
  );
  onBeforeMount(() => {
    if (data.value && !state.siteLayout.value)
      applySiteLayoutResponse(state, data.value);
  });
}
