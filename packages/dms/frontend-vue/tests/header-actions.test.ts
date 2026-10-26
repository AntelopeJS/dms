/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type App,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardHeader from "../layers/dms-layout/app/build/components/layout/DashboardHeader.vue";
import {
  BUILDER_ACTION_ID,
  type HeaderAction,
  registerHeaderAction,
  useHeaderActions,
} from "../layers/dms-layout/app/composables/useHeaderActions";
import { useSidePanel } from "../layers/dms-layout/app/composables/useSidePanel";
import { FormEvents } from "../layers/dms-ui/app/composables/form/types/events";

const ACTIVE_COLOR = "primary";
const IDLE_COLOR = "neutral";
const PANEL_ID = "demo:panel";

let sharedState: Map<string, Ref<unknown>>;
let app: App | undefined;

interface CookieOptions {
  default?: () => unknown;
}

function useDmsState<T>(key: string, init?: () => T): Ref<T> {
  if (!sharedState.has(key)) sharedState.set(key, ref(init?.()));
  return sharedState.get(key) as Ref<T>;
}

function useDmsCookie<T>(name: string, options: CookieOptions = {}): Ref<T> {
  return useDmsState(`cookie:${name}`, () => options.default?.() ?? null);
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { color: String, onClick: Function },
  setup:
    (props, { attrs }) =>
    () =>
      h("button", {
        "aria-label": attrs["aria-label"],
        "aria-pressed": attrs["aria-pressed"],
        "data-color": props.color,
        onClick: () => props.onClick?.(),
      }),
});

const SlotsStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.leading?.(), slots.right?.(), slots.default?.()]),
});

function installRuntime(): void {
  const runtime: Record<string, unknown> = {
    computed,
    FormEvents,
    ref,
    watch,
    onMounted,
    onUnmounted,
    useDmsUserSession: () => ({ loggedIn: ref(false) }),
    useQuickActions: () => ({ categoryGroups: ref([]) }),
    useNotifications: () => ({
      unreadCount: ref(0),
      unreadTone: ref(undefined),
      areCountsLoaded: ref(true),
      notifications: ref([]),
      hasMore: ref(false),
      fetchBellCounts: async () => {},
      fetchNotifications: async () => {},
      markAsRead: async () => {},
    }),
    useInfiniteScroll: () => ({
      isLoadingMore: ref(false),
      setupObserver: () => {},
      disconnectObserver: () => {},
    }),
    BUILDER_ACTION_ID,
    buildBreadcrumbTarget: () => null,
    buildFavoritePage: () => null,
    useDmsAppConfig: () => ({ ui: { icons: {} } }),
    useDmsCookie,
    useDmsRoute: () => reactive({ path: "/", query: {} }),
    useDmsState,
    useFavoritePages: () => ({ isFavorite: () => false }),
    useHeaderActions,
    useHomepage: () => "/",
    useI18n: () => ({ t: (key: string) => key }),
    useSiteLayout: () => ({ findMatchingRoute: () => null }),
    useTranslation: () => ({
      processI18n: (value: string) => value.replace(/^\$/, "t:"),
    }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
}

function createHeaderApp(create: typeof createApp): App {
  const header = create(DashboardHeader);
  header.config.globalProperties.$t = String;
  header.component("UButton", ButtonStub);
  ["UDashboardNavbar", "UTooltip", "UBreadcrumb", "UDropdownMenu"].forEach(
    (name) => header.component(name, SlotsStub),
  );
  return header;
}

async function mountHeader(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  app = createHeaderApp(createApp);
  app.mount(host);
  await nextTick();
  return host;
}

/**
 * Renders the header on the "server", runs what only the client runs (a
 * `.client` plugin), then hydrates the server markup.
 */
async function hydrateHeader(runOnClient: () => void): Promise<HTMLElement> {
  const host = document.createElement("div");
  host.innerHTML = await renderToString(createHeaderApp(createSSRApp));
  document.body.append(host);
  runOnClient();
  app = createHeaderApp(createSSRApp);
  app.mount(host);
  return host;
}

function hydrationWarnings(spies: ReturnType<typeof vi.spyOn>[]): string[] {
  return spies
    .flatMap((spy) => spy.mock.calls.map((call) => String(call[0])))
    .filter((message) => message.includes("Hydration"));
}

function button(host: HTMLElement, label: string): HTMLButtonElement | null {
  return host.querySelector(`button[aria-label="${label}"]`);
}

function action(id: string, extra: Partial<HeaderAction> = {}): HeaderAction {
  return { id, icon: "i-ph-star", label: id, ...extra };
}

beforeEach(() => {
  sharedState = new Map();
  installRuntime();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("header action registry", () => {
  it("keeps an action linked to a side panel without any callable", () => {
    registerHeaderAction(action("panel", { sidePanelId: PANEL_ID }));
    registerHeaderAction(action("stripped"));
    const { actions } = useHeaderActions();
    expect(actions.value.map((entry) => entry.id)).toEqual(["panel"]);
  });
});

describe("header action buttons", () => {
  it("renders the active state of every action, not only the builder's", async () => {
    const isOn = ref(false);
    registerHeaderAction(
      action("toggle", { onSelect: vi.fn(), isActive: () => isOn.value }),
    );
    registerHeaderAction(action("plain", { onSelect: vi.fn() }));
    const host = await mountHeader();
    const toggle = button(host, "toggle");
    expect(toggle?.dataset.color).toBe(IDLE_COLOR);
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    isOn.value = true;
    await nextTick();
    expect(toggle?.dataset.color).toBe(ACTIVE_COLOR);
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    expect(button(host, "plain")?.hasAttribute("aria-pressed")).toBe(false);
  });

  it("toggles a linked side panel and derives its state from it", async () => {
    registerHeaderAction(
      action("panel", { label: "$panel.toggle", sidePanelId: PANEL_ID }),
    );
    const host = await mountHeader();
    const toggle = button(host, "t:panel.toggle");
    const { isOpen } = useSidePanel(PANEL_ID);
    toggle?.click();
    await nextTick();
    expect(isOpen.value).toBe(true);
    expect(toggle?.dataset.color).toBe(ACTIVE_COLOR);
    toggle?.click();
    await nextTick();
    expect(isOpen.value).toBe(false);
    expect(toggle?.dataset.color).toBe(IDLE_COLOR);
  });

  it("keeps the builder action in its slot, running its own callables", async () => {
    const onSelect = vi.fn();
    registerHeaderAction(
      action(BUILDER_ACTION_ID, {
        label: "Edit",
        onSelect,
        isActive: () => true,
      }),
    );
    const host = await mountHeader();
    const builder = button(host, "Edit");
    builder?.click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(builder?.dataset.color).toBe(ACTIVE_COLOR);
  });
});

describe("header action hydration", () => {
  it("draws a client-only action once mounted, not over the server markup", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registerHeaderAction(action("panel", { sidePanelId: PANEL_ID }));
    const host = await hydrateHeader(() =>
      registerHeaderAction(action("client", { onSelect: vi.fn() })),
    );
    expect(hydrationWarnings(spies)).toEqual([]);
    expect(button(host, "panel")).not.toBeNull();
    await nextTick();
    expect(button(host, "client")).not.toBeNull();
    spies.forEach((spy) => spy.mockRestore());
  });
});
