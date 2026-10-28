<script setup lang="ts">
import { withoutTrailingSlash } from "ufo";
import { holdPageHeaderActions } from "../composables/layout/usePageHeaderActions";
import { useDevReloading } from "../build/composables/dev-reload/useDevReloadHolder";
import { usePageLiveHost } from "#dms-ui/app/build/composables/live/usePageLiveHost";
import { usePageDataRefresh } from "#dms-ui/app/build/composables/live/usePageDataRefresh";
import { usePageRecordDeletion } from "../composables/page/usePageRecordDeletion";
import { pageValidationRedirect } from "../build/utils/pageValidationRedirect";
import { resolveComponentChildren } from "#dms-ui/app/utils/componentTree";
import { isFunction } from "#dms-core/app/utils/type-check";
import type { ValidationRouteContext } from "#dms-core/app/utils/query-validation";

defineOptions({ inheritAttrs: false });

const devReloading = import.meta.env.DEV ? useDevReloading() : ref(false);

function normalizePath(path: string): string {
  return withoutTrailingSlash(path) || "/";
}

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
    if (import.meta.env.DEV && devReloading.value) {
      return;
    }
    throw showDmsError({
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
    throw showDmsError({
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

  throw showDmsError({
    statusCode: HTTP_FORBIDDEN,
    statusMessage: "Access denied",
  });
}

function isPageValid(
  metadata: PageInfo | undefined,
  query: ValidationRouteContext["query"],
  params: ValidationRouteContext["params"],
): boolean {
  if (!metadata?.validation) {
    return true;
  }

  const { validation } = metadata;
  const { getFunction } = useDefinedFunctions();

  const isQueryValid = validateRequiredQueryParams(
    validation.requiredQueryParams,
    query,
  );

  const getValidationFunction = (id: string) =>
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The registry owner erases callback signatures. Metadata selects the validation convention without runtime validation; inference cannot restore its boolean return and adding a check would alter malformed registrations.
    getFunction(id) as ValidationFunction | undefined;

  const isCustomValid = runCustomValidation(
    validation.customFunctionId,
    getValidationFunction,
    { query, params },
  );

  return isQueryValid && isCustomValid;
}

const isLeavingPage = ref(false);

async function enforcePageValidation(): Promise<void> {
  const metadata = pagelayoutMetadata.value;
  const query = route.query;
  if (isPageValid(metadata, query, routeParams.value)) {
    return;
  }
  const redirect = pageValidationRedirect(metadata?.validation, route.path, {
    routeParams: routeParams.value,
    routeQuery: query,
  });
  if (!redirect) {
    throw createDmsError({
      statusCode: HTTP_NOT_FOUND,
      statusMessage: "Page not found",
    });
  }
  isLeavingPage.value = true;
  await navigateDms(redirect, { replace: true });
}

defineDmsPageMeta({
  auth: true,
});

const PageContentRendered = holdPageHeaderActions();

const route = useDmsRoute();
const siteLayout = useSiteLayout();

const homepage = useHomepage();
const { loggedIn, reconcileSession, redirectToAuth } = useSessionRecovery();

if (!siteLayout.siteLayout.value) {
  await siteLayout.loadSiteLayout();
}

const routeMatch = computed(() => siteLayout.findMatchingRoute(route.path));
const pagelayoutMetadata = computed(() => routeMatch.value?.metadata);
const routeParams = computed(() => routeMatch.value?.params || {});

if (siteLayout.loadingError && siteLayout.loadingError.value) {
  throw createDmsError({
    statusCode: HTTP_INTERNAL_SERVER_ERROR,
    statusMessage: "Error loading site layout",
    message: siteLayout.loadingError.value || "Unknown error occurred",
  });
}

await enforcePageValidation();
await checkPageMetadata(pagelayoutMetadata.value);

if (!pagelayoutMetadata.value && !(import.meta.env.DEV && devReloading.value)) {
  throw createDmsError({
    statusCode: HTTP_NOT_FOUND,
    statusMessage: "Page not found",
  });
}

if (import.meta.env.DEV) {
  watch(devReloading, (reloading) => {
    if (!reloading && !pagelayoutMetadata.value) {
      showDmsError({
        statusCode: HTTP_NOT_FOUND,
        statusMessage: "Page not found",
      });
    }
  });
}

const { pageLayout } = await usePageLayout();

await preloadPageLayoutComponents(pageLayout.value);
watch(pageLayout, (layout) => void preloadPageLayoutComponents(layout));

const { refreshIfStale: refreshPermissionsIfStale } = usePermissions();

watch(
  () => route.path,
  async () => {
    await Promise.all([
      siteLayout.refreshIfStale(),
      refreshPermissionsIfStale(),
    ]);
    isLeavingPage.value = false;
    await enforcePageValidation();
    await checkPageMetadata(pagelayoutMetadata.value);
  },
);

const { permissions: userPermissions } = usePermissions();

const realtimePageId = computed(() => pagelayoutMetadata.value?.fullId ?? "");
const realtime = usePageRealtime(realtimePageId);
providePageRealtime(realtime);

usePageLiveHost(
  () => ({
    pageId: pagelayoutMetadata.value?.fullId,
    live: pagelayoutMetadata.value?.live,
  }),
  { isStreamConnected: () => !!realtime.sessionId.value },
);

usePageDataRefresh(realtime);

usePageRecordDeletion({
  pageLayout: () => pageLayout.value,
  pageTopics: realtime.pageTopics,
  subscribe: realtime.subscribe,
});

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
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The component bus convention supplies CustomEvent detail, but window can receive unrelated events. The existing component comparison remains the only filter; owner Event inference cannot prove the payload and validation would change behavior.
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
  const setupFn = getFunction(metadata.setupId);
  if (!setupFn) {
    console.warn(
      `[dms] page setup function "${metadata.setupId}" is not registered`,
    );
    return;
  }
  const context = buildPageSetupContext(metadata, pageSetupCleanups);
  try {
    const result = await setupFn(context);
    if (isFunction(result)) {
      pageSetupReturned = result;
    }
  } catch (err) {
    console.error(`[dms] page setup function "${metadata.setupId}" threw`, err);
  }
}

function tearDownPageSetup() {
  if (isFunction(pageSetupReturned)) {
    try {
      pageSetupReturned();
    } catch (err) {
      console.error("[dms] page setup cleanup threw", err);
    }
    pageSetupReturned = undefined;
  }
  for (const unsubscribe of pageSetupCleanups.splice(0)) {
    // prettier-ignore
    try {
      unsubscribe();
    } catch {
      // eslint-disable-line no-empty -- One failed cleanup does not prevent the remaining cleanups.
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
        ? resolveComponentChildren(componentInfo.children)
        : [],
    } satisfies ResolvedComponentInfo;
  }),
);

const fillHeight = usePageFillHeight();
const fillColumnClass = PAGE_FILL_HEIGHT_CLASSES.column;
const stackClass = computed(() =>
  fillHeight.value ? fillColumnClass : undefined,
);
const fillingComponentId = computed(() =>
  fillHeight.value ? components.value.at(-1)?.id : undefined,
);

const { t } = useI18n();
const hidesEveryBlock = computed(
  () => pageLayout.value?.allComponentsHidden === true,
);

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

      if (!next) {
        animateLayout.value = false;
        freshComponentIds.value = new Set();
        snapshotPath = path;
        snapshotPrints = prints;
        return;
      }

      if (path !== snapshotPath) {
        animateLayout.value = false;
        freshComponentIds.value = new Set();
        snapshotPath = path;
        snapshotPrints = prints;
        return;
      }

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

  let lastKnownPageId = pagelayoutMetadata.value?.fullId;
  watch(
    () => pagelayoutMetadata.value?.fullId,
    (id) => {
      if (id) lastKnownPageId = id;
    },
  );

  watch(
    () => siteLayout.siteLayout.value,
    () => {
      const layout = siteLayout.siteLayout.value;
      if (!layout) return;
      if (pagelayoutMetadata.value) return;
      const moved = lastKnownPageId
        ? Object.entries(layout.pages).find(
            ([, meta]) => meta.fullId === lastKnownPageId,
          )
        : undefined;
      if (moved) {
        void navigateDms(moved[0]);
        return;
      }
      showDmsError({
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
  <template v-if="isLeavingPage" />
  <div v-else-if="hidesEveryBlock" class="dms-card overflow-hidden">
    <DmsEmptyState
      variant="no-access"
      :title="t('page.no_visible_blocks.title')"
      :description="t('page.no_visible_blocks.description')"
    />
  </div>
  <TransitionGroup
    v-else
    tag="div"
    name="dms-fresh"
    class="dms-page-stack space-y-6"
    :class="stackClass"
    :css="animateLayout"
  >
    <!-- `empty:hidden`: a block with nothing to show (a fetched Banner the
         route answered `null`) renders a bare comment; its wrapper must not
         take a gap of the stack. -->
    <div
      v-for="component in components"
      :key="component.id"
      :class="[
        'empty:hidden',
        { 'dms-fresh-modified': freshComponentIds.has(component.id) },
        component.id === fillingComponentId && fillColumnClass,
      ]"
    >
      <DmsRecursiveComponent
        :component="component"
        :page-id="pagelayoutMetadata?.fullId ?? ''"
        :component-id="component.id"
        :route-params="routeParams"
        :layout-path="component.id"
      />
    </div>
  </TransitionGroup>
  <PageContentRendered />
</template>
