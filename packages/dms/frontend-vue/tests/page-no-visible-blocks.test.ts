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
import {
  PAGE_FILL_HEIGHT_CLASSES,
  providePageFillHeight,
  usePageFillHeight,
} from "../layers/dms-layout/app/composables/layout/usePageFillHeight";

vi.mock(
  "../layers/dms-layout/app/build/composables/dev-reload/useDevReloadHolder",
  async () => {
    const { ref } = await import("vue");
    return { useDevReloading: () => ref(false) };
  },
);

interface PageLayoutFixture {
  components: Record<string, { componentName: string }>;
  allComponentsHidden?: boolean;
}

const EMPTY_TITLE_KEY = "page.no_visible_blocks.title";
const EMPTY_DESCRIPTION_KEY = "page.no_visible_blocks.description";

const pageLayout = ref<PageLayoutFixture | null>(null);
const siteLayoutTree = ref<Record<string, unknown> | undefined>(undefined);
const navigateDms = vi.fn();

const EmptyState: FunctionalComponent<{
  title: string;
  description: string;
  variant: string;
}> = (props) =>
  h("aside", { "data-variant": props.variant }, [
    h("p", props.title),
    h("p", props.description),
  ]);
EmptyState.props = ["title", "description", "variant"];

const PageComponent: FunctionalComponent<{ componentId: string }> = (props) =>
  h("section", { "data-component": props.componentId });
PageComponent.props = ["componentId"];

function installRuntime(): void {
  const metadata = { fullId: "examples.overview", hasAccess: true };
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
    HTTP_NOT_FOUND: 404,
    PAGE_FILL_HEIGHT_CLASSES,
    providePageFillHeight,
    usePageFillHeight,
    createError: vi.fn(),
    defineDmsPageMeta: vi.fn(),
    firstAccessiblePagePath: vi.fn(),
    navigateDms,
    preloadPageLayoutComponents: vi.fn(),
    providePageRealtime: vi.fn(),
    resolveDmsComponent: () => "div",
    runCustomValidation: vi.fn(),
    showError: vi.fn(),
    validateRequiredQueryParams: vi.fn(),
    useDefinedFunctions: () => ({ getFunction: () => undefined }),
    useDmsRoute: () => ({ path: "/examples/overview", query: {} }),
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
      siteLayoutTree,
      loadingError: ref(null),
      loadSiteLayout: async () => {},
      refreshIfStale: async () => {},
      findMatchingRoute: () => ({ metadata, params: {} }),
    }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
}

async function renderPage(): Promise<HTMLElement> {
  const app = createSSRApp(() => h(CatchAllPage));
  app.component("DmsEmptyState", EmptyState);
  app.component("DmsRecursiveComponent", PageComponent);
  const host = document.createElement("div");
  host.innerHTML = await renderToString(app);
  return host;
}

beforeEach(() => {
  siteLayoutTree.value = undefined;
  navigateDms.mockClear();
  installRuntime();
});

/** The menu tree with the page, and a page nested under it. */
function treeWithNestedPage(nestedHasAccess: boolean) {
  const nested = {
    id: "invites",
    fullId: "examples.overview.invites",
    fullSlug: "/examples/overview/invites",
    layoutUrl: "/examples/overview/invites/pagelayout",
    hasAccess: nestedHasAccess,
    children: {},
    childrenOrders: [],
  };
  const overview = {
    id: "overview",
    fullId: "examples.overview",
    fullSlug: "/examples/overview",
    layoutUrl: "/examples/overview/pagelayout",
    hasAccess: false,
    children: { invites: nested },
    childrenOrders: ["invites"],
  };
  const examples = {
    id: "examples",
    fullId: "examples",
    children: { overview },
    childrenOrders: ["overview"],
  };
  return { children: { examples }, childrenOrders: ["examples"] };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a page served without any of its blocks", () => {
  it("says there is nothing to show and who to ask", async () => {
    pageLayout.value = { components: {}, allComponentsHidden: true };
    const host = await renderPage();
    const empty = host.querySelector("aside");
    expect(empty?.getAttribute("data-variant")).toBe("no-access");
    expect(empty?.textContent).toContain(EMPTY_TITLE_KEY);
    expect(empty?.textContent).toContain(EMPTY_DESCRIPTION_KEY);
    expect(host.querySelector(".dms-page-stack")).toBeNull();
  });

  it("leads to a page nested under it the viewer can open", async () => {
    pageLayout.value = { components: {}, allComponentsHidden: true };
    siteLayoutTree.value = treeWithNestedPage(true);
    await renderPage();
    expect(navigateDms).toHaveBeenCalledWith("/examples/overview/invites", {
      replace: true,
    });
  });

  it("stays put when no nested page is open to the viewer", async () => {
    pageLayout.value = { components: {}, allComponentsHidden: true };
    siteLayoutTree.value = treeWithNestedPage(false);
    await renderPage();
    expect(navigateDms).not.toHaveBeenCalled();
  });

  it("draws the blocks it was served instead", async () => {
    pageLayout.value = {
      components: { stats: { componentName: "StatGroup" } },
    };
    const host = await renderPage();
    expect(host.querySelector("aside")).toBeNull();
    expect(host.querySelector("[data-component]")).not.toBeNull();
  });

  it("leaves a page that declares no block as it is", async () => {
    pageLayout.value = { components: {} };
    const host = await renderPage();
    expect(host.querySelector("aside")).toBeNull();
  });

  it("stays quiet while the layout is still loading", async () => {
    pageLayout.value = null;
    const host = await renderPage();
    expect(host.querySelector("aside")).toBeNull();
  });
});
