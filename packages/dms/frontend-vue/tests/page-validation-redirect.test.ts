// @vitest-environment jsdom
import {
  computed,
  createSSRApp,
  h,
  inject,
  onMounted,
  onUnmounted,
  provide,
  ref,
  toRef,
  watch,
  type FunctionalComponent,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CatchAllPage from "../layers/dms-layout/app/pages/[...slug].vue";
import { pageValidationRedirect } from "../layers/dms-layout/app/build/utils/pageValidationRedirect";
import {
  runCustomValidation,
  validateRequiredQueryParams,
} from "../layers/dms-core/app/utils/query-validation";
import {
  PAGE_FILL_HEIGHT_CLASSES,
  providePageFillHeight,
  usePageFillHeight,
} from "../layers/dms-layout/app/composables/layout/usePageFillHeight";
import type { PageValidation } from "../layers/dms-layout/app/types/page";

vi.mock(
  "../layers/dms-layout/app/build/composables/dev-reload/useDevReloadHolder",
  async () => {
    const { ref } = await import("vue");
    return { useDevReloading: () => ref(false) };
  },
);

const PAGE_PATH = "/modules/marketing/funnel";
const LIST_PATH = "/modules/marketing/funnels";
const NOT_FOUND = 404;

class HttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`HTTP ${statusCode}`);
  }
}

const navigateDms = vi.fn(async () => {});
const pageQuery = ref<Record<string, unknown>>({});
const validation = ref<PageValidation | undefined>(undefined);

const PageComponent: FunctionalComponent<{ componentId: string }> = (props) =>
  h("section", { "data-component": props.componentId });
PageComponent.props = ["componentId"];

function installRuntime(): void {
  const pageLayout = ref({
    components: { report: { componentName: "FunnelReport" } },
  });
  const runtime: Record<string, unknown> = {
    computed,
    inject,
    onMounted,
    onUnmounted,
    provide,
    ref,
    toRef,
    watch,
    HTTP_FORBIDDEN: 403,
    HTTP_INTERNAL_SERVER_ERROR: 500,
    HTTP_NOT_FOUND: NOT_FOUND,
    PAGE_FILL_HEIGHT_CLASSES,
    providePageFillHeight,
    usePageFillHeight,
    createError: ({ statusCode }: { statusCode: number }) =>
      new HttpError(statusCode),
    defineDmsPageMeta: vi.fn(),
    firstAccessiblePagePath: vi.fn(),
    navigateDms,
    preloadPageLayoutComponents: vi.fn(),
    providePageRealtime: vi.fn(),
    resolveDmsComponent: () => "div",
    runCustomValidation,
    showError: vi.fn(),
    validateRequiredQueryParams,
    useDefinedFunctions: () => ({ getFunction: () => undefined }),
    useDmsRoute: () => ({ path: PAGE_PATH, query: pageQuery.value }),
    useHomepage: () => "/",
    useI18n: () => ({ t: (key: string) => key }),
    usePageLayout: async () => ({ pageLayout }),
    usePageRealtime: () => ({}),
    usePermissions: () => ({
      permissions: ref([]),
      refreshIfStale: async () => {},
    }),
    useSessionRecovery: () => ({
      loggedIn: ref(true),
      reconcileSession: async () => {},
      redirectToAuth: async () => {},
    }),
    useSiteLayout: () => ({
      siteLayout: ref({ pages: {} }),
      siteLayoutTree: ref(undefined),
      loadingError: ref(null),
      loadSiteLayout: async () => {},
      refreshIfStale: async () => {},
      findMatchingRoute: () => ({
        metadata: {
          fullId: "marketing.funnel",
          hasAccess: true,
          validation: validation.value,
        },
        params: {},
      }),
    }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
}

interface RenderedPage {
  host: HTMLElement;
  errors: unknown[];
}

async function renderPage(): Promise<RenderedPage> {
  const errors: unknown[] = [];
  const app = createSSRApp(() => h(CatchAllPage));
  app.config.errorHandler = (error) => {
    errors.push(error);
  };
  app.component("DmsRecursiveComponent", PageComponent);
  const host = document.createElement("div");
  host.innerHTML = await renderToString(app);
  return { host, errors };
}

beforeEach(() => {
  navigateDms.mockClear();
  pageQuery.value = {};
  validation.value = undefined;
  installRuntime();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pageValidationRedirect", () => {
  const context = {
    routeParams: { id: "42" },
    routeQuery: { website: "site-1" },
  };

  it("is undefined without a redirectTo", () => {
    expect(
      pageValidationRedirect(
        { requiredQueryParams: ["id"] },
        PAGE_PATH,
        context,
      ),
    ).toBeUndefined();
  });

  it("fills the page URL's tokens and leaves out an empty query pair", () => {
    expect(
      pageValidationRedirect(
        {
          redirectTo: `${LIST_PATH}?website={{query.website}}&tab={{query.tab}}`,
        },
        PAGE_PATH,
        context,
      ),
    ).toBe(`${LIST_PATH}?website=site-1`);
  });

  it("refuses a target on the page's own path, which would fail again", () => {
    expect(
      pageValidationRedirect(
        { redirectTo: `${PAGE_PATH}/?id={{query.id}}` },
        PAGE_PATH,
        context,
      ),
    ).toBeUndefined();
    expect(
      pageValidationRedirect({ redirectTo: "?id=1" }, PAGE_PATH, context),
    ).toBeUndefined();
  });
});

describe("a page failing its validation", () => {
  it("answers not found without a redirectTo", async () => {
    validation.value = { requiredQueryParams: ["id"] };
    const { errors } = await renderPage();
    expect(errors).toEqual([new HttpError(NOT_FOUND)]);
    expect(navigateDms).not.toHaveBeenCalled();
  });

  it("replaces the URL with its redirectTo, drawing none of its blocks", async () => {
    validation.value = {
      requiredQueryParams: ["id"],
      redirectTo: `${LIST_PATH}?website={{query.website}}`,
    };
    pageQuery.value = { website: "site-1" };
    const { host, errors } = await renderPage();
    expect(errors).toEqual([]);
    expect(navigateDms).toHaveBeenCalledWith(`${LIST_PATH}?website=site-1`, {
      replace: true,
    });
    expect(host.querySelector("[data-component]")).toBeNull();
  });

  it("draws its blocks once the required query is there", async () => {
    validation.value = { requiredQueryParams: ["id"], redirectTo: LIST_PATH };
    pageQuery.value = { id: "f1" };
    const { host } = await renderPage();
    expect(navigateDms).not.toHaveBeenCalled();
    expect(host.querySelector("[data-component]")).not.toBeNull();
  });
});
