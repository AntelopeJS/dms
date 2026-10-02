// @vitest-environment jsdom
import {
  computed,
  createApp,
  createSSRApp,
  h,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  reactive,
  ref,
  Suspense,
  toRef,
  watch,
  type App,
  type Component,
  type FunctionalComponent,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DefaultLayout from "../layers/dms-layout/app/custom-layouts/DefaultLayout.vue";
import CatchAllPage from "../layers/dms-layout/app/pages/[...slug].vue";
import {
  PAGE_FILL_HEIGHT_CLASSES,
  providePageFillHeight,
  usePageFillHeight,
} from "../layers/dms-layout/app/composables/layout/usePageFillHeight";

vi.mock(
  "../layers/dms-layout/app/build/components/layout/DashboardSidebar.vue",
  () => ({ default: () => null }),
);
vi.mock(
  "../layers/dms-layout/app/build/components/layout/DashboardHeader.vue",
  () => ({ default: () => null }),
);
vi.mock(
  "../layers/dms-layout/app/build/components/layout/DashboardBanners.vue",
  () => ({ default: () => null }),
);
vi.mock(
  "../layers/dms-layout/app/build/components/layout/RolePreviewBar.vue",
  () => ({ default: () => null }),
);

interface PageLayoutFixture {
  components: Record<string, { componentName: string }>;
}

const route = reactive({ path: "/tools/explorer", query: {} });
const pageLayout = ref<PageLayoutFixture | null>(null);

// The markup `DefaultLayout` and `pages/[...slug].vue` render for a
// two-component page outside the settings area, with the stubs below.
const FLOW_PAGE_MARKUP =
  '<div data-dms-persistent-shell storage-key="dms-dashboard" unit="px" data-group><!---->' +
  "<div data-panel><!--[--><!----><!----><!----><!--]-->" +
  "<div data-body>" +
  '<div class="w-full max-w-none pb-12 lg:pb-16" data-dms-page-region data-dms-page-content><!--[--><!--[-->' +
  '<section class="flex flex-wrap gap-x-3.5 gap-y-4 items-start pb-6">' +
  '<div class="mt-px rounded-[9px] bg-primary/10 shrink-0 ring ring-inset ring-primary/35 flex items-center justify-center size-9"><i class="text-primary"></i></div>' +
  '<div class="flex-1 min-w-0 md:flex-[1_1_16rem]">' +
  '<h1 class="text-highlighted text-2xl font-[650] leading-[1.2] tracking-[-0.03em]"><!--[-->Explorer<!--]--></h1><!--v-if--></div><!--[--><!--]--></section><!--[-->' +
  '<div class="dms-page-stack space-y-6">' +
  '<div class="">' +
  '<section data-component="stats" page-id="tools.explorer" layout-path="stats"></section></div>' +
  '<div class="">' +
  '<section data-component="explorer" page-id="tools.explorer" layout-path="explorer"></section></div></div><!--]--><!--]--><!--]--></div></div><!--[--><!----><!--]--></div></div>';

function withComponents(...ids: string[]): PageLayoutFixture {
  return {
    components: Object.fromEntries(
      ids.map((id) => [id, { componentName: `tool-${id}` }]),
    ),
  };
}

// Functional stubs hand non-class attributes on only when told to: these two
// spread them, so the markers the layout sets stay in the markup.
const Group: FunctionalComponent = (_, { attrs, slots }) =>
  h("div", { ...attrs, "data-group": "" }, slots.default?.());
Group.inheritAttrs = false;

const Panel: FunctionalComponent = (_, { slots }) =>
  h("div", { "data-panel": "" }, [
    slots.header?.(),
    h("div", { "data-body": "" }, slots.body?.()),
    slots.footer?.(),
  ]);

// Nuxt UI merges its container classes with the ones it is given; the stub
// keeps the given ones next to one of its own, so a lost class shows.
const Container: FunctionalComponent = (_, { attrs, slots }) =>
  h("div", { ...attrs, class: ["w-full", attrs.class] }, slots.default?.());
Container.inheritAttrs = false;

const PageComponent: FunctionalComponent<{ componentId: string }> = (props) =>
  h("section", { "data-component": props.componentId });
PageComponent.props = ["componentId"];

const FillHeightProbe: FunctionalComponent = () =>
  h("output", String(usePageFillHeight().value));

function installRuntime(): void {
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
    navigateDms: vi.fn(),
    preloadPageLayoutComponents: vi.fn(),
    providePageRealtime: vi.fn(),
    resolveDmsComponent: () => "div",
    runCustomValidation: vi.fn(),
    showError: vi.fn(),
    validateRequiredQueryParams: vi.fn(),
    useDefinedFunctions: () => ({ getFunction: () => undefined }),
    useDevReloading: () => ref(false),
    useDmsRoute: () => route,
    useDmsState: <T>(_key: string, init?: () => T) => ref(init?.()),
    useHomepage: () => "/",
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
      siteLayoutTree: ref([]),
      loadingError: ref(null),
      loadSiteLayout: async () => {},
      refresh: async () => {},
      refreshIfStale: async () => {},
      findMatchingRoute: () => ({
        metadata: { fullId: "tools.explorer", hasAccess: true },
        params: {},
      }),
      findMatchingRouteOrCategory: () => ({
        metadata: { fullId: "tools.explorer", hasAccess: true },
        params: {},
      }),
    }),
    useTranslation: () => ({ processI18n: (value: string) => value }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
}

function withStubs(app: App): App {
  app.component("UDashboardGroup", Group);
  app.component("UDashboardPanel", Panel);
  app.component("UContainer", Container);
  app.component("UIcon", () => h("i"));
  app.component("DmsAppWidgetsDock", () => null);
  app.component("DmsRecursiveComponent", PageComponent);
  return app;
}

function renderInLayout(
  layoutProps: Record<string, unknown>,
  page: Component,
): Promise<string> {
  const root = () =>
    h(
      DefaultLayout,
      { title: "Explorer", ...layoutProps },
      { default: () => h(page) },
    );
  return renderToString(withStubs(createSSRApp(root)));
}

function parse(markup: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
}

function classesOf(element: Element | null | undefined): string[] {
  return element?.getAttribute("class")?.split(" ").filter(Boolean) ?? [];
}

function expectClasses(element: Element | null | undefined, classes: string) {
  expect(classesOf(element)).toEqual(
    expect.arrayContaining(classes.split(" ")),
  );
}

function expectNoFillClasses(element: Element | null | undefined) {
  const fillClasses = new Set(
    `${PAGE_FILL_HEIGHT_CLASSES.region} ${PAGE_FILL_HEIGHT_CLASSES.column}`.split(
      " ",
    ),
  );
  expect(classesOf(element).filter((name) => fillClasses.has(name))).toEqual(
    [],
  );
}

beforeEach(() => {
  installRuntime();
  route.path = "/tools/explorer";
  pageLayout.value = withComponents("stats", "explorer");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePageFillHeight", () => {
  it("reads false under a layout that does not provide it", async () => {
    const markup = await renderToString(createSSRApp(FillHeightProbe));
    expect(markup).toBe("<output>false</output>");
  });

  it("follows the layout that provides it", async () => {
    const fillHeight = ref(true);
    const app = withStubs(
      createApp(() =>
        h(
          DefaultLayout,
          { fillHeight: fillHeight.value },
          { default: () => h(FillHeightProbe) },
        ),
      ),
    );
    const host = document.createElement("div");
    app.mount(host);
    expect(host.querySelector("output")?.textContent).toBe("true");
    fillHeight.value = false;
    await nextTick();
    expect(host.querySelector("output")?.textContent).toBe("false");
    app.unmount();
  });
});

describe("DefaultLayout without fillHeight", () => {
  it("renders the page exactly as it did before the option existed", async () => {
    expect(await renderInLayout({}, CatchAllPage)).toBe(FLOW_PAGE_MARKUP);
  });

  it("tells the page it does not fill the panel", async () => {
    const markup = await renderInLayout({}, FillHeightProbe);
    expect(parse(markup).querySelector("output")?.textContent).toBe("false");
  });
});

describe("DefaultLayout with fillHeight", () => {
  it("makes the page region a flex column with a minimum height", async () => {
    const host = parse(
      await renderInLayout({ fillHeight: true }, CatchAllPage),
    );
    const region = host.querySelector("[data-dms-page-content]");
    expectClasses(region, PAGE_FILL_HEIGHT_CLASSES.region);
    expectClasses(region, "w-full max-w-none pb-12 lg:pb-16");
  });

  it("keeps the page header a plain item of that column", async () => {
    const host = parse(
      await renderInLayout({ fillHeight: true }, CatchAllPage),
    );
    const header = host.querySelector("[data-dms-page-content] > section");
    expect(classesOf(header)).toEqual([
      "flex",
      "flex-wrap",
      "gap-x-3.5",
      "gap-y-4",
      "items-start",
      "pb-6",
    ]);
  });

  it("gives the height left to the last component only", async () => {
    const host = parse(
      await renderInLayout({ fillHeight: true }, CatchAllPage),
    );
    const stack = host.querySelector(".dms-page-stack");
    const [stats, explorer] = Array.from(stack?.children ?? []);
    expectClasses(
      stack,
      `dms-page-stack space-y-6 ${PAGE_FILL_HEIGHT_CLASSES.column}`,
    );
    expectNoFillClasses(stats);
    expectClasses(explorer, PAGE_FILL_HEIGHT_CLASSES.column);
    expect(
      explorer
        ?.querySelector("[data-component]")
        ?.getAttribute("data-component"),
    ).toBe("explorer");
  });

  it("fills with the only component of a single-component page", async () => {
    pageLayout.value = withComponents("explorer");
    const host = parse(
      await renderInLayout({ fillHeight: true }, CatchAllPage),
    );
    const wrappers = host.querySelectorAll(".dms-page-stack > div");
    expect(wrappers).toHaveLength(1);
    expectClasses(wrappers[0], PAGE_FILL_HEIGHT_CLASSES.column);
  });

  it("tells a custom page, rendered straight in the slot, to fill", async () => {
    const markup = await renderInLayout({ fillHeight: true }, FillHeightProbe);
    expect(parse(markup).querySelector("output")?.textContent).toBe("true");
  });

  it("drops the fill classes when a navigation lands on a page without the option", async () => {
    const fillHeight = ref(true);
    const app = withStubs(
      createApp(() =>
        h(
          DefaultLayout,
          { title: "Explorer", fillHeight: fillHeight.value },
          {
            default: () =>
              h(Suspense, null, { default: () => h(CatchAllPage) }),
          },
        ),
      ),
    );
    const host = document.createElement("div");
    app.mount(host);
    await vi.waitFor(() =>
      expect(host.querySelector(".dms-page-stack")).not.toBeNull(),
    );
    expectClasses(
      host.querySelector(".dms-page-stack"),
      PAGE_FILL_HEIGHT_CLASSES.column,
    );

    fillHeight.value = false;
    await nextTick();

    expectNoFillClasses(host.querySelector("[data-dms-page-content]"));
    expectNoFillClasses(host.querySelector(".dms-page-stack"));
    host
      .querySelectorAll(".dms-page-stack > div")
      .forEach((wrapper) => expectNoFillClasses(wrapper));
    app.unmount();
  });
});
