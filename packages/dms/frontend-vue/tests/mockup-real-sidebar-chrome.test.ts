/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  h,
  reactive,
  ref,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyMenuRouteState,
  translateMenuItems,
} from "../layers/dms-core/app/utils/menu";
import CollapsedMenuItem from "../layers/dms-layout/app/components/navigation/CollapsedMenuItem.vue";
import DashboardSidebar from "../layers/dms-layout/app/entries/components/layout/DashboardSidebar";
import { PREVIEW_CHANNEL } from "../layers/dms-ui/app/entries/utils/blockPreview";
import type { PreviewNavigation } from "../layers/dms-ui/app/entries/utils/blockPreview";
import { browserRuntime } from "./helpers/api-data-runtime";
import { stubDmsState } from "./helpers/dms-state-stub";
import {
  flush,
  posted,
  registerMenu,
  shopNavigation,
  stubMenuRuntime,
} from "./helpers/mockup-sidebar";

let app: App | undefined;
let host: HTMLDivElement;
/** The dashboard's sidebar state, as `useSidebarState` shares it. */
let sidebarState: Map<string, Ref<unknown>>;
/** Asks the sidebar to fold or unfold, as its toggle and a drag on its edge do. */
let toggleSidebar: () => void;

beforeEach(() => {
  stubMenuRuntime();
  sidebarState = new Map<string, Ref<unknown>>([
    ["dms-sidebar-collapsed", ref(false)],
    ["dms-sidebar-open", ref(false)],
  ]);
  stubDmsState(sidebarState);
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
  browserRuntime(app);
  registerMenu(app);
  app.component(
    "UDashboardSidebar",
    defineComponent({
      props: { collapsed: Boolean },
      emits: ["update:collapsed"],
      setup: (props, { slots, attrs, emit }) => {
        toggleSidebar = () => emit("update:collapsed", !props.collapsed);
        return () =>
          h(
            "aside",
            { ...attrs, "data-collapsed": props.collapsed || undefined },
            [
              slots.header?.({ collapsed: props.collapsed }),
              slots.default?.({ collapsed: props.collapsed }),
              slots.footer?.({ collapsed: props.collapsed }),
            ],
          );
      },
    }),
  );
  app.component("DmsLink", PassThrough("a"));
  app.component("DmsCollapsedMenuItem", CollapsedMenuItem);
  app.component("UTooltip", PassThrough("span"));
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

/** The names of the links and buttons a pointer or the keyboard can reach. */
function reachable(): (string | undefined)[] {
  return [...host.querySelectorAll<HTMLElement>("a, button")]
    .filter(
      (element) =>
        element.closest("[inert]") === null &&
        !(element instanceof HTMLButtonElement && element.disabled),
    )
    .map(
      (element) =>
        element.getAttribute("aria-label") ?? element.textContent?.trim(),
    );
}

describe("the dashboard's sidebar around a mockup", () => {
  it("draws the brand, the widgets, the search and the account but lets only the mockup's pages act, and reads nothing for itself (fails when a copied control acts or each frame reads the module store)", async () => {
    const { readApiData, cleanupFavorites } = stubSidebarRuntime();
    await mountSidebar({ navigation: shopNavigation(false) });

    expect(find("[data-widget]")).not.toBeNull();
    expect(host.querySelector("img")).not.toBeNull();
    expect(reachable()).toEqual(["Home", "Orders"]);
    expect(find("aside")?.hasAttribute("data-dms-preview-navigation")).toBe(
      true,
    );
    expect(find("[data-search]")).toBeNull();
    expect(readApiData).not.toHaveBeenCalled();
    expect(cleanupFavorites).not.toHaveBeenCalled();
  });

  it("stays folded to its rail whatever the dashboard's state, and a toggle unfolds nothing (fails when a mockup's sidebar follows the dashboard's state or unfolds)", async () => {
    stubSidebarRuntime();
    await mountSidebar({ navigation: shopNavigation(false) });

    expect(find("aside")?.hasAttribute("data-collapsed")).toBe(true);

    toggleSidebar();
    await flush();
    expect(find("aside")?.hasAttribute("data-collapsed")).toBe(true);
    expect(sidebarState.get("dms-sidebar-collapsed")?.value).toBe(false);
  });

  it("picks a mockup page from its icon on the rail, the page in view marked (fails when the rail draws the mockup's pages as icons that do nothing)", async () => {
    stubSidebarRuntime();
    await mountSidebar({ navigation: shopNavigation(false) });

    const orders = find('button[data-dms-preview-page="orders"]');
    expect(orders?.getAttribute("aria-current")).toBe("page");
    expect(orders?.className).toContain("bg-elevated");

    find('button[data-dms-preview-page="home"]')?.click();
    expect(posted("navigate")).toEqual([
      { channel: PREVIEW_CHANNEL, type: "navigate", id: "home" },
    ]);
  });

  it("shrinks each widget sketch to a chip on the rail, marked Custom with its caption, as a real widget shrinks to its icon (fails when a widget is left out of the rail or drawn in full there)", async () => {
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
    expect(widget?.hasAttribute("data-collapsed")).toBe(true);
    expect(widget?.querySelector("iframe")).toBeNull();
    expect(
      widget?.querySelector("[role=img]")?.getAttribute("aria-label"),
    ).toBe("dms.block_preview.sketch_label · Your plan");
    expect(find("[data-widget]")).not.toBeNull();
  });

  it("draws the mockup's widget sketches in full below the app's widgets once the sidebar is opened below the desktop width, each in a sandboxed frame under its caption (fails when a widget is left out or drawn above the app's)", async () => {
    stubSidebarRuntime();
    sidebarState.set("dms-sidebar-open", ref(true));
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
    expect(host.textContent).toContain("Live orders");
    const frame = widget.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("");
    expect(frame?.getAttribute("srcdoc")).toContain("<p>Pro</p>");
    expect(frame?.style.height).toBe("120px");
  });

  it("follows the dashboard's collapsed state, and its toggle, outside a mockup (fails when the dashboard's own sidebar is held on its rail)", async () => {
    stubSidebarRuntime();
    await mountSidebar({});

    expect(find("aside")?.hasAttribute("data-collapsed")).toBe(false);

    toggleSidebar();
    await flush();
    expect(find("aside")?.hasAttribute("data-collapsed")).toBe(true);
    expect(sidebarState.get("dms-sidebar-collapsed")?.value).toBe(true);
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
