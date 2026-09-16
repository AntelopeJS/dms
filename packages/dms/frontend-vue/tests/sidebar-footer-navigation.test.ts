// @vitest-environment jsdom
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
  type PropType,
} from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import Sidebar from "../layers/dms-layout/app/build/components/layout/DashboardSidebar.vue";
import { addActiveStateToMenuItem } from "../layers/dms-core/app/utils/menu";

const route = reactive({ path: "/modules/automation/runs", query: {} });
let app: App;
let host: HTMLDivElement;

const Navigation = defineComponent({
  props: {
    items: { type: Array as PropType<NavigationMenuItem[]>, required: true },
  },
  setup: (props) => () =>
    h(
      "nav",
      props.items.map((item) =>
        h(
          "a",
          {
            href: item.to,
            "data-exact": String(item.exact),
            "data-active": String(item.active),
          },
          item.label,
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
  vi.stubGlobal("useCurrentModule", () =>
    computed(() =>
      route.path.startsWith("/modules/automation")
        ? { id: "automation" }
        : null,
    ),
  );
  vi.stubGlobal("useSidebarWidgets", () => ({ widgets: ref([]) }));
  vi.stubGlobal("useHomepage", () => "/settings");
  vi.stubGlobal("getExpandedItemIds", () => []);
}

beforeEach(() => {
  installRuntime();
  host = document.createElement("div");
});
afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it.each(["/modules/automation/runs", "/modules", "/settings/user/profile"])(
  "keeps exact footer destinations and Settings prefix highlighting on %s",
  (path) => {
    route.path = path;
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
    app.component(
      "DmsDashboardSearch",
      defineComponent({ render: () => null }),
    );
    app.mount(host);
    const modules = [...host.querySelectorAll('a[href="/modules"]')];
    expect(modules).toHaveLength(
      path.startsWith("/modules/automation") ? 2 : 1,
    );
    modules.forEach((link) =>
      expect(link.getAttribute("data-exact")).toBe("true"),
    );
    const settings = host.querySelector('a[href="/settings"]')!;
    expect(settings.getAttribute("data-exact")).not.toBe("true");
    expect(settings.getAttribute("data-active") === "true").toBe(
      path.startsWith("/settings"),
    );
  },
);
