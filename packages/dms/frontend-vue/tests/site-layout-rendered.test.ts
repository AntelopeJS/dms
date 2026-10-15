// @vitest-environment jsdom
/**
 * The site layout of a page that brings none with its props (a custom page)
 * as the sidebar reads it, through the runtime's real async data: the server
 * waits for it and renders the menu, and the browser takes it over without
 * asking again. A page that brought it reads nothing.
 */
import {
  defineComponent,
  getCurrentInstance,
  h,
  nextTick,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  engine,
  hydrate,
  serverRender,
  stubApiData,
} from "./helpers/api-data-runtime";
import {
  useRenderedSiteLayout,
  useSiteLayout,
} from "../layers/dms-layout/app/composables/page/useSiteLayout";

const RESPONSE = {
  siteLayout: { pages: { "/orders": { fullId: "orders" } }, categories: {} },
  siteLayoutTree: { children: {} },
  quickActions: { actions: [] },
  modules: {},
  isOwner: true,
};

const authFetch = vi.fn();
const mounted: App[] = [];

// The menu as the header and the sidebar draw it: rendered by the frame, in
// the persistent layout, outside the page's <Suspense>.
const Menu = defineComponent({
  setup() {
    const { siteLayout } = useSiteLayout();
    return () =>
      h("nav", Object.keys(siteLayout.value?.pages ?? {}).join(",") || "-");
  },
});
const Frame = defineComponent({
  setup() {
    useRenderedSiteLayout();
    return () => h("div", [h(Menu), h(Menu)]);
  },
});
const Layout = defineComponent({ setup: () => () => h("main", [h(Frame)]) });

beforeEach(() => {
  stubApiData(authFetch);
  // The application holds the in-flight request its callers join.
  vi.stubGlobal(
    "useDmsApp",
    () => getCurrentInstance()!.appContext.config.globalProperties,
  );
  vi.stubGlobal("showError", vi.fn());
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("renders the menu of a page without a site layout, and the browser does not read it again", async () => {
  authFetch.mockResolvedValue(RESPONSE);
  const { html, payload } = await serverRender(Layout);
  expect(html).toBe("<main><div><nav>/orders</nav><nav>/orders</nav></div></main>");
  expect(authFetch).toHaveBeenCalledTimes(1);
  expect(authFetch).toHaveBeenCalledWith("/dms/sitelayout");

  authFetch.mockClear();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { app, container } = hydrate(Layout, html, payload);
  mounted.push(app);
  await nextTick();
  await new Promise((done) => setTimeout(done, 0));
  expect(authFetch).not.toHaveBeenCalled();
  expect(container.innerHTML).toBe(html);
  // Taken over before the frame's children render: they hydrate the menu.
  expect(warn.mock.calls.flat().join(" ")).not.toMatch(/hydration/i);
});

it("reads nothing when the page brought its site layout", async () => {
  const { html, payload } = await serverRender(Layout, (app) =>
    app.runWithContext(() => {
      engine.useDmsState("dms-siteLayout").value = RESPONSE.siteLayout;
    }),
  );
  expect(html).toBe("<main><div><nav>/orders</nav><nav>/orders</nav></div></main>");
  expect(authFetch).not.toHaveBeenCalled();
  expect(payload.data).toEqual({});
});
