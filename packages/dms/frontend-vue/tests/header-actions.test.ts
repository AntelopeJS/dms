/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  createSSRApp,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
  type App,
  type Component,
  type FunctionalComponent,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardHeader from "../layers/dms-layout/app/entries/components/layout/DashboardHeader";
import {
  BUILDER_ACTION_ID,
  type HeaderAction,
  registerHeaderAction,
  useHeaderActions,
} from "../layers/dms-layout/app/composables/useHeaderActions";
import { useSidePanel } from "../layers/dms-ui/app/composables/useSidePanel";
import { FormEvents } from "../layers/dms-ui/app/composables/form/types/events";

const ACTIVE_COLOR = "primary";
const IDLE_COLOR = "neutral";
const PANEL_ID = "demo:panel";

let sharedState: Map<string, Ref<unknown>>;
let app: App | undefined;
let serverHtml = "";

interface CookieOptions {
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The cookie stub stores heterogeneous defaults and has no single value schema.
  default?: () => unknown;
}

function useDmsState<T>(key: string, init?: () => T): Ref<T> {
  if (!sharedState.has(key)) sharedState.set(key, ref(init?.()));
  // SAFETY: Each state key is initialized once by its caller and reused with that caller's value type.
  return sharedState.get(key) as Ref<T>;
}

function useDmsCookie<T>(name: string, options: CookieOptions = {}): Ref<T> {
  return useDmsState(`cookie:${name}`, () => options.default?.() ?? null);
}

const ButtonStub = defineComponent({
  inheritAttrs: false,
  props: { color: String, icon: String, onClick: Function },
  setup:
    (props, { attrs, slots }) =>
    () =>
      h(
        "button",
        {
          "aria-label": attrs["aria-label"],
          "aria-pressed": attrs["aria-pressed"],
          "data-color": props.color,
          onClick: () => props.onClick?.(),
        },
        slots.leading?.() ?? [h("i", { "data-icon": props.icon })],
      ),
});

const IconStub = defineComponent({
  inheritAttrs: false,
  props: { name: String },
  setup:
    (props, { attrs }) =>
    () =>
      h("i", { "data-icon": props.name, class: attrs.class }),
});

const AnimatedIcon: FunctionalComponent = () =>
  h("svg", { "data-animated-icon": "" });

let registeredComponents: Record<string, Component>;

const SlotsStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.leading?.(), slots.right?.(), slots.default?.()]),
});

function installRuntime(): void {
  const runtime = {
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
    resolveDmsComponent: (name?: string) =>
      name === undefined ? undefined : registeredComponents[name],
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
  header.component("UIcon", IconStub);
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
  serverHtml = await renderToString(createHeaderApp(createSSRApp));
  host.innerHTML = serverHtml;
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

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function button(host: HTMLElement, label: string): HTMLButtonElement | null {
  return host.querySelector(`button[aria-label="${label}"]`);
}

function action(id: string, extra: Partial<HeaderAction> = {}): HeaderAction {
  return { id, icon: "i-ph-star", label: id, ...extra };
}

beforeEach(() => {
  sharedState = new Map();
  registeredComponents = { StateIcon: AnimatedIcon };
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

describe("header action icon component", () => {
  it("draws the registered component inside the button instead of the icon", async () => {
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    const host = await mountHeader();
    const state = button(host, "state");
    expect(state?.querySelector("[data-animated-icon]")).not.toBeNull();
    expect(state?.querySelector("[data-icon]")).toBeNull();
  });

  it("draws icon while the name resolves to no component", async () => {
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "Missing" }),
    );
    const host = await mountHeader();
    const state = button(host, "state");
    expect(state?.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-star",
    );
    expect(state?.querySelector("[data-animated-icon]")).toBeNull();
  });

  it("draws icon for an action that names no component", async () => {
    registerHeaderAction(action("plain", { sidePanelId: PANEL_ID }));
    const host = await mountHeader();
    expect(button(host, "plain")?.querySelector("[data-icon]")).not.toBeNull();
  });

  it("gives only the action naming a component its component", async () => {
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    registerHeaderAction(action("plain", { onSelect: vi.fn() }));
    const host = await mountHeader();
    expect(button(host, "plain")?.querySelector("[data-icon]")).not.toBeNull();
    expect(
      button(host, "plain")?.querySelector("[data-animated-icon]"),
    ).toBeNull();
  });

  it("draws the component on the builder button too", async () => {
    registerHeaderAction(
      action(BUILDER_ACTION_ID, {
        label: "Edit",
        onSelect: vi.fn(),
        iconComponent: "StateIcon",
      }),
    );
    const host = await mountHeader();
    expect(
      button(host, "Edit")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
  });

  it("keeps the click, label and pressed state of the button", async () => {
    registerHeaderAction(
      action("state", {
        label: "$state.toggle",
        sidePanelId: PANEL_ID,
        iconComponent: "StateIcon",
      }),
    );
    const host = await mountHeader();
    const state = button(host, "t:state.toggle");
    state?.click();
    await nextTick();
    expect(useSidePanel(PANEL_ID).isOpen.value).toBe(true);
    expect(state?.getAttribute("aria-pressed")).toBe("true");
    expect(state?.dataset.color).toBe(ACTIVE_COLOR);
  });
});

describe("header action async icon component", () => {
  function registerAsyncIcon(
    loader: () => Promise<Component>,
    extra: Partial<HeaderAction> = {},
  ): void {
    registeredComponents.Slow = defineAsyncComponent(loader);
    registerHeaderAction(
      action("slow", {
        sidePanelId: PANEL_ID,
        iconComponent: "Slow",
        ...extra,
      }),
    );
  }

  it("draws icon until the component arrives, not an empty button", async () => {
    let arrive: (component: Component) => void = () => undefined;
    registerAsyncIcon(
      () => new Promise<Component>((resolve) => (arrive = resolve)),
    );
    const host = await mountHeader();
    await settle();
    const slow = button(host, "slow");
    expect(slow?.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-star",
    );
    expect(slow?.querySelector("[data-animated-icon]")).toBeNull();
    arrive(AnimatedIcon);
    await settle();
    expect(slow?.querySelector("[data-animated-icon]")).not.toBeNull();
    expect(slow?.querySelector("[data-icon]")).toBeNull();
  });

  it("draws icon on the builder button until its component arrives", async () => {
    let arrive: (component: Component) => void = () => undefined;
    registerAsyncIcon(
      () => new Promise<Component>((resolve) => (arrive = resolve)),
      { id: BUILDER_ACTION_ID, icon: "i-ph-hammer", label: "Edit" },
    );
    const host = await mountHeader();
    await settle();
    expect(
      button(host, "Edit")
        ?.querySelector("[data-icon]")
        ?.getAttribute("data-icon"),
    ).toBe("i-ph-hammer");
    arrive(AnimatedIcon);
    await settle();
    expect(
      button(host, "Edit")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
  });

  it("keeps drawing icon when the component fails to load, without an unhandled error", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    registerAsyncIcon(() => Promise.reject(new Error("chunk failed")));
    const host = await mountHeader();
    await settle();
    const slow = button(host, "slow");
    expect(slow?.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "i-ph-star",
    );
    expect(slow?.querySelector("[data-animated-icon]")).toBeNull();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("draws the component of a re-registration after the first one failed to load", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerAsyncIcon(() => Promise.reject(new Error("chunk failed")));
    const host = await mountHeader();
    await settle();
    registerHeaderAction(
      action("slow", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    await settle();
    expect(
      button(host, "slow")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(button(host, "slow")?.querySelector("[data-icon]")).toBeNull();
    error.mockRestore();
    warn.mockRestore();
  });

  it("reports a failed load in development instead of swallowing it", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    registerAsyncIcon(() => Promise.reject(new Error("chunk failed")));
    await mountHeader();
    await settle();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("header action icon component"),
      expect.objectContaining({ message: "chunk failed" }),
    );
    error.mockRestore();
    warn.mockRestore();
  });

  it("keeps the icon at the size of the regular leading icon", async () => {
    registerAsyncIcon(() => new Promise<Component>(() => undefined));
    const host = await mountHeader();
    await settle();
    expect(button(host, "slow")?.querySelector("[data-icon]")?.className).toBe(
      "size-[18px] shrink-0",
    );
  });
});

describe("header action hydration", () => {
  it("hydrates a server-rendered icon component without a mismatch", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registerHeaderAction(
      action("state", { sidePanelId: PANEL_ID, iconComponent: "StateIcon" }),
    );
    const host = await hydrateHeader(() => undefined);
    expect(serverHtml).toContain('data-icon="i-ph-star"');
    expect(serverHtml).not.toContain("<svg");
    await nextTick();
    expect(
      button(host, "state")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(button(host, "state")?.querySelector("[data-icon]")).toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("leaves exactly one icon when the client chunk of a server-rendered component rejects", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registeredComponents.Slow = defineAsyncComponent(async () => AnimatedIcon);
    registerHeaderAction(
      action("slow", { sidePanelId: PANEL_ID, iconComponent: "Slow" }),
    );
    const host = await hydrateHeader(() => {
      registeredComponents.Slow = defineAsyncComponent(() =>
        Promise.reject(new Error("chunk failed")),
      );
    });
    await settle();
    const slow = button(host, "slow");
    expect(slow?.querySelectorAll("[data-icon]")).toHaveLength(1);
    expect(slow?.querySelector("svg")).toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("draws icon on the server and hydrates cleanly a component that throws only there", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    let onServer = true;
    registeredComponents.ServerOnlyFailure = () => {
      if (onServer) throw new Error("window is not defined");
      return h("svg", { "data-animated-icon": "" });
    };
    registerHeaderAction(
      action("state", {
        sidePanelId: PANEL_ID,
        iconComponent: "ServerOnlyFailure",
      }),
    );
    const host = await hydrateHeader(() => {
      onServer = false;
    });
    expect(serverHtml).toContain('data-icon="i-ph-star"');
    await nextTick();
    expect(
      button(host, "state")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

  it("hydrates a server-rendered async icon component without a mismatch or a lost icon", async () => {
    const spies = [
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    registeredComponents.Slow = defineAsyncComponent(async () => AnimatedIcon);
    registerHeaderAction(
      action("slow", { sidePanelId: PANEL_ID, iconComponent: "Slow" }),
    );
    const host = await hydrateHeader(() => undefined);
    await settle();
    expect(
      button(host, "slow")?.querySelector("[data-animated-icon]"),
    ).not.toBeNull();
    expect(button(host, "slow")?.querySelector("[data-icon]")).toBeNull();
    expect(hydrationWarnings(spies)).toEqual([]);
    spies.forEach((spy) => spy.mockRestore());
  });

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
