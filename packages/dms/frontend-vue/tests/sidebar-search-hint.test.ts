// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
  type App,
  type PropType,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import Sidebar from "../layers/dms-layout/app/build/components/layout/DashboardSidebar.vue";
import { KEYBOARD_PLATFORM_COOKIE } from "../layers/dms-ui/app/composables/global/keyboardPlatform";
import { addActiveStateToMenuItem } from "../layers/dms-core/app/utils/menu";

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const NAVIGATORS = {
  mac: { userAgent: MAC_UA, platform: "MacIntel", hint: "macOS" },
  windows: { userAgent: WINDOWS_UA, platform: "Win32", hint: "Windows" },
} as const;

const route = reactive({ path: "/settings", query: {} });
let cookies: Map<string, Ref<unknown>>;
let app: App | undefined;
let host: HTMLDivElement;

/** Stands in for Nuxt UI's button: its kbds, and its tooltip's while collapsed. */
const SearchButton = defineComponent({
  props: {
    kbds: { type: Array as PropType<string[]>, default: () => [] },
    tooltip: { type: Object as PropType<{ kbds?: string[] }>, default: null },
  },
  setup: (props) => () =>
    h("button", { "data-testid": "search" }, [
      ...props.kbds.map((kbd) => h("kbd", { "data-slot": "hint" }, kbd)),
      ...(props.tooltip?.kbds ?? []).map((kbd) =>
        h("kbd", { "data-slot": "tooltip" }, kbd),
      ),
    ]),
});

function installRuntime(initialCookies: Record<string, unknown>) {
  cookies = new Map(
    Object.entries(initialCookies).map(([key, value]) => [key, ref(value)]),
  );
  Object.entries({
    computed,
    ref,
    watch,
    onMounted,
    onBeforeUnmount,
    addActiveStateToMenuItem,
  }).forEach(([key, value]) => vi.stubGlobal(key, value));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsAppConfig", () => ({}));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsState", (_key: string, initial: () => unknown) =>
    ref(initial()),
  );
  // One ref per cookie, shared by every caller, as `useDmsCookie` does.
  vi.stubGlobal(
    "useDmsCookie",
    (key: string, options: { default: () => unknown }) => {
      if (!cookies.has(key)) cookies.set(key, ref(options.default()));
      return cookies.get(key);
    },
  );
  vi.stubGlobal("useSiteLayout", () => ({
    siteLayout: ref({}),
    siteLayoutTree: ref(),
    findMatchingRoute: () => null,
    findMatchingRouteOrCategory: () => null,
  }));
  vi.stubGlobal("useFavoritePages", () => ({
    cleanupInvalidFavorites: vi.fn(),
    sortedFavorites: ref([]),
  }));
  vi.stubGlobal("useIsOwner", () => ref(true));
  vi.stubGlobal("useCurrentModule", () => computed(() => null));
  vi.stubGlobal("useSidebarWidgets", () => ({ widgets: ref([]) }));
  vi.stubGlobal("useHomepage", () => "/settings");
  vi.stubGlobal("getExpandedItemIds", () => []);
}

function useNavigator(kind: keyof typeof NAVIGATORS) {
  const nav = NAVIGATORS[kind];
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(nav.userAgent);
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(nav.platform);
  Object.defineProperty(window.navigator, "userAgentData", {
    configurable: true,
    value: { platform: nav.hint },
  });
}

function createSidebarApp(collapsed = false): App {
  const sidebarApp = createSSRApp(Sidebar);
  sidebarApp.component(
    "UDashboardSidebar",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("aside", slots.default?.({ collapsed })),
    }),
  );
  sidebarApp.component("UDashboardSearchButton", SearchButton);
  for (const name of [
    "DmsNavigationMenu",
    "DmsDashboardSearch",
    "DmsSidebarUserMenu",
  ])
    sidebarApp.component(name, defineComponent({ render: () => null }));
  return sidebarApp;
}

function hints(slot: "hint" | "tooltip"): string[] {
  return [...host.querySelectorAll(`kbd[data-slot="${slot}"]`)].map(
    (kbd) => kbd.textContent ?? "",
  );
}

beforeEach(() => {
  host = document.createElement("div");
});
afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, "userAgentData");
});

describe("sidebar search hint", () => {
  it.each([
    ["mac", "⌘K"],
    ["windows", "Ctrl K"],
  ] as const)("reads the %s keyboard once mounted", async (kind, expected) => {
    installRuntime({});
    useNavigator(kind);
    app = createSidebarApp();
    app.mount(host);
    await nextTick();
    expect(hints("hint")).toEqual([expected]);
  });

  it("names the key in the collapsed rail's tooltip", async () => {
    installRuntime({});
    useNavigator("windows");
    app = createSidebarApp(true);
    app.mount(host);
    await nextTick();
    expect(hints("tooltip")).toEqual(["Ctrl K"]);
  });

  it("corrects a stale platform cookie after mount", async () => {
    installRuntime({ [KEYBOARD_PLATFORM_COOKIE]: "mac" });
    useNavigator("windows");
    app = createSidebarApp();
    app.mount(host);
    await nextTick();
    expect(hints("hint")).toEqual(["Ctrl K"]);
    expect(cookies.get(KEYBOARD_PLATFORM_COOKIE)?.value).toBe("other");
  });

  it.each([
    [{}, "Ctrl K"],
    [{ [KEYBOARD_PLATFORM_COOKIE]: "mac" }, "⌘K"],
    [{ [KEYBOARD_PLATFORM_COOKIE]: "other" }, "Ctrl K"],
  ])(
    "server-renders the cookie's platform (%o), so hydration matches",
    async (initialCookies, expected) => {
      installRuntime(initialCookies);
      useNavigator("mac");
      const html = await renderToString(createSidebarApp());
      expect(html).toContain(`<kbd data-slot="hint">${expected}</kbd>`);
    },
  );
});
