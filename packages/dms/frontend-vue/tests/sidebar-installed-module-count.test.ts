/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type App,
} from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import Sidebar from "../layers/dms-layout/app/entries/components/layout/DashboardSidebar";
import { ENDPOINT_MODULES_LISTING } from "../layers/dms-layout/app/composables/page/useModulesListing";
import { ENDPOINT_STORE_LISTING } from "../layers/dms-layout/app/composables/page/useModuleStore";

const route = reactive({ path: "/home", query: {} });
let app: App;
let host: HTMLDivElement;

const ASSISTANT = {
  id: "ai",
  title: "$dms_ai.module.title",
  description: "$dms_ai.module.description",
  icon: "i-ph-sparkle",
  hasAccess: true,
  landingSlug: "/modules/ai/overview",
};

function storeEntry(id: string, state: "active" | "available") {
  return {
    id,
    package: `@antelopejs/dms-${id}`,
    icon: "i-ph-package",
    category: "developer",
    title: `$modules.store.catalog.${id}.title`,
    description: `$modules.store.catalog.${id}.description`,
    state,
    installedVersion: state === "active" ? "0.9.0" : undefined,
    source: "npm",
    updateAvailable: false,
    compatible: true,
    frontend: "none",
    missingInterfaces: [],
    dependents: [],
    usedByProject: false,
  };
}

/** The modules page's data: the assistant registers pages, the Builder does not. */
const ANSWERS: Record<string, unknown> = {
  [ENDPOINT_MODULES_LISTING]: [ASSISTANT],
  [ENDPOINT_STORE_LISTING]: {
    enabled: true,
    busy: false,
    dev: true,
    interfaceVersion: "0.10.3",
    modules: [
      storeEntry("ai", "active"),
      storeEntry("builder", "active"),
      storeEntry("mailing", "available"),
    ],
  },
};

const Navigation = defineComponent({
  props: ["items"],
  setup: (props) => () =>
    h(
      "nav",
      props.items.map((item: NavigationMenuItem) =>
        h(
          "a",
          { href: item.to },
          [item.label, item.badge ? ` ${item.badge.label}` : ""].join(""),
        ),
      ),
    ),
});

function installRuntime() {
  Object.entries({
    computed,
    ref,
    watch,
    onMounted,
    onBeforeUnmount,
  }).forEach(([key, value]) => vi.stubGlobal(key, value));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en"),
  }));
  vi.stubGlobal("useDmsAppConfig", () => ({}));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsState", <T>(_key: string, initial: () => T) =>
    ref(initial()),
  );
  vi.stubGlobal("isDmsHydrating", () => false);
  vi.stubGlobal(
    "useDmsCookie",
    <T>(_key: string, options: { default: () => T }) => ref(options.default()),
  );
  vi.stubGlobal("useSiteLayout", () => ({
    siteLayout: ref({}),
    siteLayoutTree: ref({
      childrenOrders: [],
      children: {
        modules: {
          childrenOrders: ["ai"],
          children: { ai: { id: "ai", isModuleRoot: true } },
        },
      },
    }),
    findMatchingRoute: () => null,
    findMatchingRouteOrCategory: () => null,
  }));
  vi.stubGlobal("useApiData", (url: () => string | null) => ({
    data: ref(ANSWERS[url() ?? ""] ?? null),
    error: ref(null),
    pending: ref(false),
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useApiErrorPresenter", () => ({ resolveError: vi.fn() }));
  vi.stubGlobal("useFavoritePages", () => ({
    cleanupInvalidFavorites: vi.fn(),
    sortedFavorites: ref([]),
  }));
  vi.stubGlobal("useIsOwner", () => ref(true));
  vi.stubGlobal("useCurrentModule", () => computed(() => null));
  vi.stubGlobal("useSidebarWidgets", () => ({ widgets: ref([]) }));
  vi.stubGlobal("useHomepage", () => "/home");
  vi.stubGlobal("useCurrentUser", () => ({ user: ref({ name: "Viewer" }) }));
  vi.stubGlobal("useLogout", () => ({ logout: vi.fn() }));
  vi.stubGlobal("useColorModePreference", () => ref("light"));
  vi.stubGlobal("useUniqueLocales", () => ({ uniqueLocales: ref([]) }));
  vi.stubGlobal("useUserLanguage", () => ({ changeLanguage: vi.fn() }));
  vi.stubGlobal("useFileReadUrls", () => ({
    getUrl: () => undefined,
    resolve: async () => {},
  }));
  vi.stubGlobal("SETTINGS_ROUTE", "/settings");
  vi.stubGlobal("ACCOUNT_MENU_ENTRIES", []);
  vi.stubGlobal("collectOpenItemIds", () => []);
  vi.stubGlobal("translateMenuItems", (items: NavigationMenuItem[][]) => items);
  vi.stubGlobal(
    "applyMenuRouteState",
    (items: NavigationMenuItem[][]) => items,
  );
}

beforeEach(() => {
  installRuntime();
  host = document.createElement("div");
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("badges Modules with the installed modules the Modules page lists, one of them without pages", () => {
  app = createApp(Sidebar);
  app.component(
    "UDashboardSidebar",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          slots.footer?.({ collapsed: false }),
    }),
  );
  app.component("DmsNavigationMenu", Navigation);
  app.component("DmsDashboardSearch", defineComponent({ render: () => null }));
  app.mount(host);

  expect(host.querySelector('a[href="/modules"]')?.textContent).toBe(
    "menu.modules 2",
  );
});
