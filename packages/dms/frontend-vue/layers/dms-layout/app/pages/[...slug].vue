<script setup lang="ts">
import { withoutTrailingSlash } from "ufo";

// Dev-only: created behind the flag so the key never reaches a production
// SSR payload.
const devReloading = import.meta.env.DEV ? useDevReloading() : ref(false);

function normalizePath(path: string): string {
  return withoutTrailingSlash(path) || "/";
}

// A user whose role cannot access the configured homepage would otherwise hit
// a dead-end 403 right after login; send them to the first page they can
// access instead. Runs after `await siteLayout.refresh()`, so it must not call
// context-dependent composables — it reads the already-captured `homepage` and
// `siteLayout` refs and resolves the target with the pure `firstAccessiblePagePath`.
async function redirectDeniedHomepage(): Promise<boolean> {
  if (normalizePath(route.path) !== normalizePath(homepage)) {
    return false;
  }
  const fallback = firstAccessiblePagePath(siteLayout.siteLayoutTree.value);
  if (!fallback || normalizePath(fallback) === normalizePath(route.path)) {
    return false;
  }
  await navigateDms(fallback, { replace: true });
  return true;
}

async function checkPageMetadata(
  metadata: PageInfo | undefined,
): Promise<void> {
  if (!metadata) {
    // A hot reload unregisters the page for a moment. The dev-reload plugin is
    // already polling for it to come back, so flashing a 404 in the meantime
    // reports an error that is about to fix itself.
    if (import.meta.env.DEV && devReloading.value) {
      return;
    }
    throw showError({
      statusCode: HTTP_NOT_FOUND,
      statusMessage: "Page not found",
    });
  }

  if (metadata.hasAccess !== false) {
    return;
  }

  await reconcileSession();

  if (!loggedIn.value) {
    await redirectToAuth();
    return;
  }

  await recheckAccessWithFreshSession();
}

async function recheckAccessWithFreshSession(): Promise<void> {
  const refreshed = await siteLayout
    .refresh()
    .then(() => true)
    .catch(() => false);
  if (!refreshed) {
    return;
  }

  const freshMetadata = pagelayoutMetadata.value;
  if (!freshMetadata) {
    if (import.meta.env.DEV && devReloading.value) {
      return;
    }
    throw showError({
      statusCode: HTTP_NOT_FOUND,
      statusMessage: "Page not found",
    });
  }

  if (freshMetadata.hasAccess !== false) {
    return;
  }

  if (await redirectDeniedHomepage()) {
    return;
  }

  throw showError({
    statusCode: HTTP_FORBIDDEN,
    statusMessage: "Access denied",
  });
}

function validatePage(
  metadata: PageInfo | undefined,
  query: Record<string, unknown>,
  params: Record<string, unknown>,
): void {
  if (!metadata?.validation) {
    return;
  }

  const { validation } = metadata;
  const { getFunction } = useDefinedFunctions();

  const isQueryValid = validateRequiredQueryParams(
    validation.requiredQueryParams,
    query,
  );

  const getValidationFunction = (id: string) =>
    getFunction(id) as ValidationFunction | undefined;

  const isCustomValid = runCustomValidation(
    validation.customFunctionId,
    getValidationFunction,
    { query, params },
  );

  if (!isQueryValid || !isCustomValid) {
    throw createError({
      statusCode: HTTP_NOT_FOUND,
      statusMessage: "Page not found",
    });
  }
}

defineDmsPageMeta({
  auth: true,
});

const route = useDmsRoute();
const siteLayout = useSiteLayout();
// Captured synchronously so `redirectDeniedHomepage` can use it after an await.
const homepage = useHomepage();
const { loggedIn, reconcileSession, redirectToAuth } = useSessionRecovery();

if (!siteLayout.siteLayout.value) {
  await siteLayout.loadSiteLayout();
}

const routeMatch = computed(() => siteLayout.findMatchingRoute(route.path));
const pagelayoutMetadata = computed(() => routeMatch.value?.metadata);
const routeParams = computed(() => routeMatch.value?.params || {});

if (siteLayout.loadingError && siteLayout.loadingError.value) {
  throw createError({
    statusCode: HTTP_INTERNAL_SERVER_ERROR,
    statusMessage: "Error loading site layout",
    message: siteLayout.loadingError.value || "Unknown error occurred",
  });
}

validatePage(pagelayoutMetadata.value, route.query, routeParams.value);
await checkPageMetadata(pagelayoutMetadata.value);

// Same reason as the guard inside `checkPageMetadata`: while a dev reload is in
// flight the page is unregistered for a moment, and the plugin is already
// waiting for it to come back.
if (!pagelayoutMetadata.value && !(import.meta.env.DEV && devReloading.value)) {
  throw createError({
    statusCode: HTTP_NOT_FOUND,
    statusMessage: "Page not found",
  });
}

if (import.meta.env.DEV) {
  // A page held back by the guard above has to be judged again once the reload
  // ends, or a URL that genuinely does not exist stays blank instead of
  // reporting a 404.
  //
  // Registered here, before any further await: setup suspends on the
  // `useAsyncData` below, and a reload that settles in the meantime would flip
  // the flag back with nobody watching.
  watch(devReloading, (reloading) => {
    if (!reloading && !pagelayoutMetadata.value) {
      // `showError` commits the error itself; throwing on top of it would only
      // add a second report of the same thing.
      showError({
        statusCode: HTTP_NOT_FOUND,
        statusMessage: "Page not found",
      });
    }
  });
}

const { pageLayout } = await usePageLayout();

watch(pageLayout, (layout) => preloadPageLayoutComponents(layout), {
  immediate: true,
});

const { refreshIfStale: refreshPermissionsIfStale } = usePermissions();

watch(
  () => route.path,
  async () => {
    await Promise.all([
      siteLayout.refreshIfStale(),
      refreshPermissionsIfStale(),
    ]);
    validatePage(pagelayoutMetadata.value, route.query, routeParams.value);
    await checkPageMetadata(pagelayoutMetadata.value);
  },
);

const { permissions: userPermissions } = usePermissions();

const realtimePageId = computed(() => pagelayoutMetadata.value?.fullId ?? "");
const realtime = usePageRealtime(realtimePageId);
providePageRealtime(realtime);

function buildPageSetupContext(
  pageInfo: PageInfo,
  cleanups: Array<() => void>,
): PageSetupContext {
  return {
    pageInfo,
    get permissions() {
      return userPermissions.value;
    },
    on(component, event, handler) {
      const listener = (e: Event) => {
        const detail = (e as CustomEvent<ComponentEventData>).detail;
        if (!detail || detail.component !== component) {
          return;
        }
        handler(detail.data);
      };
      window.addEventListener(event, listener);
      const unsubscribe = () => window.removeEventListener(event, listener);
      cleanups.push(unsubscribe);
      return unsubscribe;
    },
    emit(component, event, data) {
      if (typeof window === "undefined") {
        return;
      }
      const customEvent = new CustomEvent<ComponentEventData>(event, {
        detail: { component, data },
      });
      window.dispatchEvent(customEvent);
    },
  };
}

const pageSetupCleanups: Array<() => void> = [];
let pageSetupReturned: PageSetupCleanup | undefined;

async function runPageSetup() {
  const metadata = pagelayoutMetadata.value;
  if (!metadata?.setupId) {
    return;
  }
  const { getFunction } = useDefinedFunctions();
  const setupFn = getFunction(metadata.setupId) as
    | PageSetupFunction
    | undefined;
  if (!setupFn) {
    console.warn(
      `[dms] page setup function "${metadata.setupId}" is not registered`,
    );
    return;
  }
  const context = buildPageSetupContext(metadata, pageSetupCleanups);
  try {
    const result = await setupFn(context);
    if (typeof result === "function") {
      pageSetupReturned = result;
    }
  } catch (err) {
    console.error(`[dms] page setup function "${metadata.setupId}" threw`, err);
  }
}

function tearDownPageSetup() {
  if (typeof pageSetupReturned === "function") {
    try {
      pageSetupReturned();
    } catch (err) {
      console.error("[dms] page setup cleanup threw", err);
    }
    pageSetupReturned = undefined;
  }
  for (const unsubscribe of pageSetupCleanups.splice(0)) {
    try {
      unsubscribe();
    } catch {
      /* noop */
    }
  }
}

watch(
  () => pagelayoutMetadata.value?.setupId,
  async (newId, oldId) => {
    if (newId === oldId) {
      return;
    }
    tearDownPageSetup();
    await runPageSetup();
  },
);

onMounted(runPageSetup);
onUnmounted(tearDownPageSetup);

const processChildren = (
  children: ComponentChild[],
): ResolvedComponentInfo[] => {
  return children.map((child) => {
    const { id, component, ...additionalProps } = child;
    return {
      id,
      options: component.options,
      component: component.componentName
        ? resolveDmsComponent(component.componentName) || "div"
        : "div",
      componentName: component.componentName,
      children: component.children ? processChildren(component.children) : [],
      ...additionalProps,
    };
  });
};

const components = computed(() =>
  Object.keys(pageLayout.value?.components || {}).map((field) => {
    const componentInfo = pageLayout.value?.components[field];
    return {
      id: field,
      options: componentInfo?.options,
      component: componentInfo?.componentName
        ? resolveDmsComponent(componentInfo.componentName) || "div"
        : "div",
      componentName: componentInfo?.componentName,
      children: componentInfo?.children
        ? processChildren(componentInfo.children)
        : [],
    } as ResolvedComponentInfo;
  }),
);

// --- Live-edit highlight ---------------------------------------------------
// When the active page's layout changes in place (DMS dev hot-reload, same
// route), animate the components that changed. Added/removed components are
// handled by <TransitionGroup> via their keys; here we only flag in-place
// modifications so they can pulse. Navigating to another route swaps the
// snapshot silently — no animation. Dev-only.
const MODIFIED_HIGHLIGHT_MS = 900;
const freshComponentIds = ref<Set<string>>(new Set());
const animateLayout = ref(false);

if (import.meta.env.DEV) {
  const fingerprintComponents = (
    layout: typeof pageLayout.value,
  ): Map<string, string> => {
    const prints = new Map<string, string>();
    const layoutComponents = layout?.components ?? {};
    for (const id of Object.keys(layoutComponents)) {
      prints.set(id, JSON.stringify(layoutComponents[id]));
    }
    return prints;
  };

  let snapshotPath = route.path;
  let snapshotPrints = fingerprintComponents(pageLayout.value);
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => pageLayout.value,
    (next) => {
      const path = route.path;
      const prints = fingerprintComponents(next);

      // Page has no layout anymore (e.g. it was just deleted): don't animate;
      // the disappearance watcher below redirects or 404s.
      if (!next) {
        animateLayout.value = false;
        freshComponentIds.value = new Set();
        snapshotPath = path;
        snapshotPrints = prints;
        return;
      }

      // A different route owns this layout (navigation / first load): swap the
      // snapshot silently, no animation.
      if (path !== snapshotPath) {
        animateLayout.value = false;
        freshComponentIds.value = new Set();
        snapshotPath = path;
        snapshotPrints = prints;
        return;
      }

      // Same route, layout changed in place: flag the components whose
      // definition changed (added/removed are animated by <TransitionGroup>).
      const modified = new Set<string>();
      for (const [id, print] of prints) {
        const previous = snapshotPrints.get(id);
        if (previous !== undefined && previous !== print) {
          modified.add(id);
        }
      }

      animateLayout.value = true;
      freshComponentIds.value = modified;
      snapshotPath = path;
      snapshotPrints = prints;

      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = setTimeout(() => {
        freshComponentIds.value = new Set();
      }, MODIFIED_HIGHLIGHT_MS);
    },
  );

  // Track the current page's id so we can follow it if its URL changes.
  let lastKnownPageId = pagelayoutMetadata.value?.fullId;
  watch(
    () => pagelayoutMetadata.value?.fullId,
    (id) => {
      if (id) lastKnownPageId = id;
    },
  );

  // After a resync, if the current route no longer matches any page, the page
  // was removed or its URL changed. Follow it by id if it moved, else 404.
  watch(
    () => siteLayout.siteLayout.value,
    () => {
      const layout = siteLayout.siteLayout.value;
      if (!layout) return;
      if (pagelayoutMetadata.value) return; // still exists at this route
      const moved = lastKnownPageId
        ? Object.entries(layout.pages).find(
            ([, meta]) => meta.fullId === lastKnownPageId,
          )
        : undefined;
      if (moved) {
        void navigateDms(moved[0]);
        return;
      }
      showError({
        statusCode: HTTP_NOT_FOUND,
        statusMessage: "Page not found",
      });
    },
  );

  onUnmounted(() => {
    if (highlightTimer) clearTimeout(highlightTimer);
  });
}
</script>

<template>
  <TransitionGroup
    tag="div"
    name="dms-fresh"
    class="dms-page-stack space-y-6"
    :css="animateLayout"
  >
    <div
      v-for="component in components"
      :key="component.id"
      :class="{ 'dms-fresh-modified': freshComponentIds.has(component.id) }"
    >
      <DmsRecursiveComponent
        :component="component"
        :page-id="pagelayoutMetadata?.fullId ?? ''"
        :component-id="component.id"
        :route-params="routeParams"
      />
    </div>
  </TransitionGroup>
</template>
