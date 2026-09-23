import { withoutTrailingSlash } from "ufo";

const STALE_THRESHOLD_MS = 300_000;
const IN_FLIGHT_SITE_LAYOUT_KEY = "__dmsInFlightSiteLayout";
const IN_FLIGHT_PAGE_LAYOUTS_KEY = "__dmsInFlightPageLayouts";

interface PageLayoutRequest {
  cache: Record<string, PageLayout>;
  promise: Promise<PageLayout>;
}

function getCachedLayoutUrls(
  previousSite: SiteLayout | undefined,
  previousCache: Record<string, PageLayout>,
  nextSite: SiteLayout,
): string[] {
  const urls = Object.entries(previousSite?.pages ?? {}).flatMap(
    ([path, page]) => {
      const nextPage = nextSite.pages[path];
      return previousCache[page.layoutUrl] &&
        nextPage?.layoutUrl &&
        nextPage.hasAccess !== false
        ? [nextPage.layoutUrl]
        : [];
    },
  );
  return [...new Set(urls)];
}

interface MatchRouteOptions {
  includeCategories: boolean;
}

interface MatchRouteResult {
  pattern: string;
  metadata: PageInfo | CategoryInfo;
  params: Record<string, string>;
}

// A route pattern can carry the same placeholder name twice: a page-mode form
// sub-page under a page whose own slug is `:id` resolves to
// `/workspaces/:id/invoiceTable/:id/edit`. The bare name holds the LAST
// occurrence, so `params.id` keeps meaning the row id the way it does on every
// single-placeholder form route, and each occurrence of a repeated name is
// exposed as well under `<name>:<n>`, numbered from 1 in pattern order, so the
// id of the carrying page stays reachable as `id:1`. A name that occurs only
// once gets no indexed key: those bags are exactly what they were.
const OCCURRENCE_KEY_SEPARATOR = ":";

const occurrenceKey = (name: string, occurrence: number): string =>
  `${name}${OCCURRENCE_KEY_SEPARATOR}${occurrence}`;

function countByName(names: string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const name of names) {
    totals[name] = (totals[name] ?? 0) + 1;
  }
  return totals;
}

function buildParamBag(
  names: string[],
  values: string[],
): Record<string, string> {
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

export const useSiteLayout = () => {
  const siteLayout = useDmsState<SiteLayout | undefined>(
    "dms-siteLayout",
    () => undefined,
  );
  const siteLayoutTree = useDmsState<SiteLayoutTree | undefined>(
    "dms-pageTree",
    () => undefined,
  );
  const quickActions = useDmsState<QuickActionsPayload | undefined>(
    "dms-quickActions",
    () => undefined,
  );
  const modules = useDmsState<Record<string, ModuleWithAccess> | undefined>(
    "dms-modules",
    () => undefined,
  );
  const isOwner = useDmsState<boolean>("dms-isOwner", () => false);

  const isLoading = useDmsState<boolean>("dms-loading", () => false);
  const loadingError = useDmsState<string | null>("dms-error", () => null);

  const pageLayouts = useDmsState<Record<string, PageLayout>>(
    "dms-pageLayouts",
    () => ({}),
  );
  const lastRefreshTime = useDmsState<number>("dms-lastRefreshTime", () => 0);

  // Held on the DMS app rather than in a per-call ref: every caller of
  // useSiteLayout writes the same shared layout state, so they have to see the
  // same in-flight fetch. Two instances each running their own would let the
  // older answer land last and overwrite the fresher menu. Not useDmsState —
  // a promise does not survive the SSR payload — and not module scope, which
  // the server would share across requests. Same holder as the session
  // refresh dedup (see runDeduped).
  const dmsApp = useDmsApp() as unknown as Record<PropertyKey, unknown>;
  const pageLayoutPromises =
    (dmsApp[IN_FLIGHT_PAGE_LAYOUTS_KEY] as Map<string, PageLayoutRequest>) ??
    new Map<string, PageLayoutRequest>();
  dmsApp[IN_FLIGHT_PAGE_LAYOUTS_KEY] = pageLayoutPromises;
  const loadingPromise = {
    get value(): Promise<boolean> | null {
      return (dmsApp[IN_FLIGHT_SITE_LAYOUT_KEY] as Promise<boolean>) ?? null;
    },
    set value(promise: Promise<boolean> | null) {
      dmsApp[IN_FLIGHT_SITE_LAYOUT_KEY] = promise;
    },
  };

  interface SiteLayoutResponse {
    siteLayout: SiteLayout;
    siteLayoutTree: SiteLayoutTree;
    quickActions: QuickActionsPayload;
    modules: Record<string, ModuleWithAccess>;
    isOwner: boolean;
  }

  const SITE_LAYOUT_ENDPOINT = "/dms/sitelayout";
  const SITE_LAYOUT_ERROR_MESSAGE = "Error loading siteLayout";
  const UNKNOWN_SITE_LAYOUT_ERROR = "Unknown error loading siteLayout";
  const HTTP_INTERNAL_ERROR = 500;

  const applySiteLayoutResponse = (result: SiteLayoutResponse) => {
    siteLayout.value = result.siteLayout;
    siteLayoutTree.value = result.siteLayoutTree;
    quickActions.value = result.quickActions;
    modules.value = result.modules;
    isOwner.value = result.isOwner;
    lastRefreshTime.value = Date.now();
  };

  const handleSiteLayoutError = (error: unknown) => {
    const errorMessage =
      error instanceof Error ? error.message : UNKNOWN_SITE_LAYOUT_ERROR;
    loadingError.value = errorMessage;
    showError({
      statusCode: HTTP_INTERNAL_ERROR,
      statusMessage: SITE_LAYOUT_ERROR_MESSAGE,
      message: errorMessage,
    });
  };

  const requestSiteLayout = async (fatal: boolean): Promise<boolean> => {
    const initialLayout = siteLayout.value;
    const initialCache = pageLayouts.value;
    const isCurrent = () =>
      siteLayout.value === initialLayout && pageLayouts.value === initialCache;
    const { $authFetch } = useAuthFetch();
    try {
      const result = await $authFetch<SiteLayoutResponse>(SITE_LAYOUT_ENDPOINT);
      const nextCache: Record<string, PageLayout> = {};
      // Initial page loads mutate this cache in place; identity guards cannot detect those additions.
      while (isCurrent()) {
        const urls = fatal
          ? []
          : getCachedLayoutUrls(
              initialLayout,
              initialCache,
              result.siteLayout,
            ).filter((url) => !nextCache[url]);
        if (!urls.length) {
          if (!fatal) pageLayouts.value = nextCache;
          applySiteLayoutResponse(result);
          return true;
        }
        const layouts = await Promise.all(
          urls.map(
            async (url) => [url, await $authFetch<PageLayout>(url)] as const,
          ),
        );
        Object.assign(nextCache, Object.fromEntries(layouts));
      }
      return true;
    } catch (error) {
      // Failed background refreshes must not leave a fatal error for the next navigation.
      if (fatal && isCurrent()) handleSiteLayoutError(error);
      throw error;
    }
  };

  const startSiteLayoutFetch = (fatal = true): Promise<boolean> => {
    const started = requestSiteLayout(fatal).finally(() => {
      isLoading.value = false;
      // A waiting refresh may already have started its replacement request.
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

  // `fatal: false` keeps a failed refetch from swapping the app for the error
  // page — for background resyncs (a realtime menu invalidation), where a
  // network blip must not destroy a working session.
  const refresh = async (options?: { fatal?: boolean }) => {
    // Background refreshes stage page layouts before committing; identity refreshes clear immediately.
    if (options?.fatal !== false) clearPageLayoutCaches();

    // A fetch already in flight was started before whatever prompted this
    // call, so its answer cannot contain the change: joining it would report
    // success on stale data and leave the menu wrong until the next event or
    // the staleness refresh, minutes later. Let it settle, then run exactly
    // one more — however many refreshes piled up while it was running.
    const inFlight = loadingPromise.value;
    if (inFlight) {
      await inFlight.catch(() => undefined);
      // The settled promise is still parked here — its cleanup runs a
      // microtask later — so drop it explicitly rather than joining it again.
      if (loadingPromise.value === inFlight) {
        loadingPromise.value = null;
      }
    }
    if (!loadingPromise.value) {
      isLoading.value = true;
      loadingError.value = null;
      loadingPromise.value = startSiteLayoutFetch(options?.fatal ?? true);
    }
    await loadingPromise.value;
  };

  const refreshIfStale = async () => {
    const elapsed = Date.now() - lastRefreshTime.value;
    if (elapsed < STALE_THRESHOLD_MS) {
      return;
    }
    await refresh();
  };

  const loadPageLayout = async (slug: string): Promise<PageLayout> => {
    if (pageLayouts.value[slug]) {
      return pageLayouts.value[slug];
    }

    const cache = pageLayouts.value;
    const pending = pageLayoutPromises.get(slug);
    if (pending?.cache === cache) {
      return pending.promise;
    }

    const { $authFetch } = useAuthFetch();
    const request = $authFetch<PageLayout>(slug).then((result) => {
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

    if (options.includeCategories && layout.categories[normalizedPath]) {
      return {
        pattern: normalizedPath,
        metadata: layout.categories[normalizedPath],
        params: {},
      };
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

  const findMatchingRoute = (
    path: string,
  ): {
    pattern: string;
    metadata: PageInfo;
    params: Record<string, string>;
  } | null => {
    const layout = siteLayout.value;
    if (!layout) return null;

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

  // Dev-only atomic readiness commit: fetch a FRESH site layout and, ONLY if
  // `path` resolves in it, commit that exact layout to reactive state and report
  // success. If the route is absent (mid hot reload, when only some modules have
  // re-registered) nothing is committed and it returns false so the caller keeps
  // polling.
  //
  // The check and the commit share a single fetch deliberately. A previous
  // version probed with one fetch and then let `refresh()` re-fetch and commit
  // with a second — a TOCTOU gap. A hot reload can re-register a module more
  // than once in quick succession, so a second unregister burst could land
  // between the probe and the commit, making `refresh()` commit a layout that no
  // longer contains the route and 404 the page the user is on. Committing the
  // very layout we validated closes that window.
  const probeAndCommitRoute = async (path: string): Promise<boolean> => {
    // Dev-only: this fires an extra /dms/sitelayout fetch and exists solely for
    // the dev-reload plugin. It stays in the composable's return (guarding the
    // export would make it optional and break the plugin's call site), so no-op
    // outside dev to keep accidental production use from issuing the request.
    if (!import.meta.env.DEV) return false;
    const { $authFetch } = useAuthFetch();
    try {
      const result = await $authFetch<SiteLayoutResponse>(SITE_LAYOUT_ENDPOINT);
      // Mirror the page renderer's resolution (findMatchingRoute, pages-only):
      // the page at `pages/[...slug].vue` and the auth/module-routing middleware
      // all match with includeCategories:false, so a category-only match here
      // would commit a layout the renderer still 404s. Gate on a real page.
      if (
        matchRoute(path, result.siteLayout, { includeCategories: false }) ===
        null
      ) {
        return false;
      }
      clearPageLayoutCaches();
      applySiteLayoutResponse(result);
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
    refreshIfStale,
    findMatchingRoute,
    findMatchingRouteOrCategory,
    probeAndCommitRoute,
  };
};
