/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  h,
  reactive,
  ref,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMenuRouteState,
  translateMenuItems,
} from "../layers/dms-core/app/utils/menu";
import DashboardSidebar from "../layers/dms-layout/app/entries/components/layout/DashboardSidebar";
import type { PreviewNavigation } from "../layers/dms-ui/app/entries/utils/blockPreview";
import {
  flush,
  registerMenu,
  shopNavigation,
  stubMenuRuntime,
} from "./helpers/mockup-sidebar";

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  stubMenuRuntime();
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

/** The app's own menu as the site layout serves it: one page. */
const SITE_LAYOUT_TREE = {
  id: "root",
  fullId: "",
  displayName: "",
  fullSlug: "",
  childrenOrders: ["orders"],
  children: {
    orders: {
      id: "orders",
      fullId: "orders",
      displayName: "Live orders",
      fullSlug: "/orders",
      layoutUrl: "/orders",
      childrenOrders: [],
      children: {},
    },
  },
};

const DemoWidget = defineComponent({
  render: () => h("button", { type: "button", "data-widget": "" }, "Widget"),
});

function stubSidebarRuntime() {
  const readApiData = vi.fn(() => ({
    data: ref(null),
    error: ref(null),
    pending: ref(false),
    status: ref("success"),
  }));
  const cleanupFavorites = vi.fn();
  Object.entries({
    useApiData: readApiData,
    useAuthFetch: () => ({ $authFetch: vi.fn() }),
    useApiErrorPresenter: () => ({ resolveError: vi.fn() }),
    useDmsAppConfig: () => ({}),
    useDmsRoute: () => reactive({ path: "/dms-preview", query: {} }),
    isDmsHydrating: () => false,
    useDmsCookie: <T>(_key: string, options: { default: () => T }) =>
      ref(options.default()),
    useSiteLayout: () => ({
      siteLayout: ref({}),
      siteLayoutTree: ref(SITE_LAYOUT_TREE),
      findMatchingRoute: () => null,
      findMatchingRouteOrCategory: () => null,
    }),
    useFavoritePages: () => ({
      cleanupInvalidFavorites: cleanupFavorites,
      sortedFavorites: ref([]),
    }),
    useIsOwner: () => ref(true),
    useCurrentModule: () => computed(() => null),
    useSidebarWidgets: () => ({
      widgets: ref([{ id: "demo", component: "DemoWidget" }]),
    }),
    useHomepage: () => "/",
    useCurrentUser: () => ({ user: ref({ name: "Viewer" }) }),
    useLogout: () => ({ logout: vi.fn() }),
    useColorModePreference: () => ref("light"),
    useUniqueLocales: () => ({ uniqueLocales: ref([]) }),
    useUserLanguage: () => ({ changeLanguage: vi.fn() }),
    useFileReadUrls: () => ({
      getUrl: () => undefined,
      resolve: async () => {},
    }),
    useModulesListing: () => ({ modules: ref([]) }),
    SETTINGS_ROUTE: "/settings",
    ACCOUNT_MENU_ENTRIES: [],
    DEFAULT_PAGE_ICON: "i-ph-file",
    collectOpenItemIds: () => [],
    translateMenuItems,
    applyMenuRouteState,
  }).forEach(([key, value]) => vi.stubGlobal(key, value));
  return { readApiData, cleanupFavorites };
}

const PassThrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup:
      (_, { attrs, slots }) =>
      () =>
        h(
          tag,
          { ...attrs, type: tag === "button" ? "button" : undefined },
          slots.default?.(),
        ),
  });

const find = (selector: string) => host.querySelector<HTMLElement>(selector);

async function mountSidebar(props: {
  navigation?: PreviewNavigation;
}): Promise<void> {
  app = createApp({ render: () => h(DashboardSidebar, props) });
  registerMenu(app);
  app.component(
    "UDashboardSidebar",
    defineComponent({
      setup:
        (_, { slots, attrs }) =>
        () =>
          h("aside", attrs, [
            slots.header?.({ collapsed: false }),
            slots.default?.({ collapsed: false }),
            slots.footer?.({ collapsed: false }),
          ]),
    }),
  );
  app.component("DmsLink", PassThrough("a"));
  app.component("UColorModeImage", PassThrough("img"));
  app.component("UDashboardSearchButton", PassThrough("button"));
  app.component("DemoWidget", DemoWidget);
  app.component("UAvatar", PassThrough("span"));
  app.component(
    "DmsDashboardSearch",
    defineComponent({ render: () => h("div", { "data-search": "" }) }),
  );
  app.mount(host);
  await flush();
}

/** The links and buttons a pointer or the keyboard can reach. */
function reachable(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>("a, button")].filter(
    (element) =>
      element.closest("[inert]") === null &&
      !(element instanceof HTMLButtonElement && element.disabled),
  );
}

describe("the dashboard's sidebar around a mockup", () => {
  it("draws the brand, the widgets, the search and the account but lets only the mockup's pages act, and reads nothing for itself (fails when a copied control acts or each frame reads the module store)", async () => {
    const { readApiData, cleanupFavorites } = stubSidebarRuntime();
    await mountSidebar({ navigation: shopNavigation(false) });

    expect(find("[data-widget]")).not.toBeNull();
    expect(host.querySelector("img")).not.toBeNull();
    expect(host.textContent).toContain("Live orders");
    expect(reachable().map((element) => element.textContent?.trim())).toEqual([
      "Home",
      "Orders",
    ]);
    expect(find("aside")?.hasAttribute("data-dms-preview-navigation")).toBe(
      true,
    );
    expect(find("[data-search]")).toBeNull();
    expect(readApiData).not.toHaveBeenCalled();
    expect(cleanupFavorites).not.toHaveBeenCalled();
  });

  it("draws the mockup's widget sketches below the app's widgets, each in a sandboxed frame under its caption (fails when a widget is left out or drawn above the app's)", async () => {
    stubSidebarRuntime();
    await mountSidebar({
      navigation: {
        ...shopNavigation(false),
        widgets: [
          { id: "plan", caption: "Your plan", html: "<p>Pro</p>", height: 120 },
        ],
      },
    });

    const widget = find('[data-dms-preview-sidebar-widget="plan"]');
    const appWidget = find("[data-widget]");
    if (!widget || !appWidget) throw new Error("no widgets");
    expect(
      appWidget.compareDocumentPosition(widget) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(widget.textContent).toContain("Your plan");
    const frame = widget.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("");
    expect(frame?.getAttribute("srcdoc")).toContain("<p>Pro</p>");
    expect(frame?.style.height).toBe("120px");
  });

  it("acts in full in the dashboard (fails when the dashboard's own sidebar goes inert)", async () => {
    const { readApiData } = stubSidebarRuntime();
    await mountSidebar({});

    expect(host.querySelector("[inert]")).toBeNull();
    expect(find("[data-widget]")?.closest("[inert]")).toBeNull();
    expect(find("[data-search]")).not.toBeNull();
    expect(readApiData).toHaveBeenCalled();
  });
});
