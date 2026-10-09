// @vitest-environment jsdom
import {
  computed,
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  toRef,
  watch,
  type App,
  type Component,
  type FunctionalComponent,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardFrame from "../layers/dms-layout/app/build/components/layout/DashboardFrame.vue";
import SidePanelHost from "../layers/dms-layout/app/build/components/layout/SidePanelHost.vue";
import {
  readSidePanelPreferences,
  SIDE_PANEL_COOKIE,
  type SidePanelPreferences,
} from "../layers/dms-layout/app/build/composables/layout/sidePanelState";
import { SIDE_PANEL_KEYBOARD_STEP_PX } from "../layers/dms-layout/app/build/composables/layout/useSidePanelWidth";
import {
  registerSidePanel,
  resolveSidePanelWidthBounds,
  type SidePanel,
  unregisterSidePanel,
  useAppSidePanels,
} from "../layers/dms-layout/app/composables/useAppSidePanels";
import { useSidePanel } from "../layers/dms-layout/app/composables/useSidePanel";
import {
  PAGE_FILL_HEIGHT_CLASSES,
  providePageFillHeight,
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

const PANEL_COMPONENT = "DemoSidePanel";
const DESKTOP_QUERY = "(min-width: 1024px)";
const WIDTH_VARIABLE = "--dms-side-panel-width";
const DEFAULT_WIDTH = 440;
const OVERLAYS_STATE_KEY = "dms-app-overlays";

let sharedState: Map<string, Ref<unknown>>;
let cookies: Map<string, Ref<unknown>>;
let loggedIn: Ref<boolean>;
let isDesktop: boolean;
let mountedPanels: number;
let app: App | undefined;

interface CookieOptions {
  default?: () => unknown;
}

function useDmsState<T>(key: string, init?: () => T): Ref<T> {
  if (!sharedState.has(key)) sharedState.set(key, ref(init?.()));
  return sharedState.get(key) as Ref<T>;
}

function useDmsCookie<T>(name: string, options: CookieOptions = {}): Ref<T> {
  if (!cookies.has(name)) cookies.set(name, ref(options.default?.() ?? null));
  return cookies.get(name) as Ref<T>;
}

function preferences(): SidePanelPreferences {
  return readSidePanelPreferences(cookies.get(SIDE_PANEL_COOKIE)?.value);
}

function storePreferences(value: unknown): void {
  useDmsCookie(SIDE_PANEL_COOKIE).value = value;
}

function panel(id: string, extra: Partial<SidePanel> = {}): SidePanel {
  return { id, component: PANEL_COMPONENT, ...extra };
}

const PanelBody = defineComponent({
  setup() {
    onMounted(() => {
      mountedPanels += 1;
    });
    return () => h("section", { "data-panel-body": "" }, "Assistant");
  },
});

const Group: FunctionalComponent = (_, { attrs, slots }) =>
  h("div", { ...attrs, "data-group": "" }, slots.default?.());

const Panel: FunctionalComponent = (_, { slots }) =>
  h("div", { "data-page-panel": "" }, [
    slots.header?.(),
    h("div", { "data-body": "" }, slots.body?.()),
    slots.footer?.(),
  ]);

function installRuntime(): void {
  const runtime: Record<string, unknown> = {
    computed,
    onBeforeUnmount,
    onMounted,
    provide,
    ref,
    toRef,
    watch,
    PAGE_FILL_HEIGHT_CLASSES,
    providePageFillHeight,
    defineDmsPlugin: (plugin: unknown) => plugin,
    resolveDmsComponent: () => undefined,
    useDmsCookie,
    useDmsState,
    useI18n: () => ({ t: (key: string) => key }),
    useTranslation: () => ({ processI18n: (value: string) => value }),
    useUserSession: () => ({ loggedIn }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
}

function stubMatchMedia(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === DESKTOP_QUERY && isDesktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function withStubs(target: App): App {
  target.component("UDashboardGroup", Group);
  target.component("UDashboardPanel", Panel);
  target.component("UContainer", (_, { slots }) => h("div", slots.default?.()));
  target.component("DmsAppWidgetsDock", () => null);
  target.component(PANEL_COMPONENT, PanelBody);
  return target;
}

/**
 * The app runtime's shape: overlays (the side panel host) first, then the
 * routed layout, keyed so that another layout mounts another frame.
 */
function appRoot(layout: Ref<string>, page: Ref<string>): Component {
  return {
    render: () => [
      h(SidePanelHost),
      h(DashboardFrame, { key: layout.value }, () =>
        h("article", { key: page.value }, page.value),
      ),
    ],
  };
}

function mountApp(layout = ref("default"), page = ref("home")): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  app = withStubs(createApp(appRoot(layout, page)));
  app.mount(host);
  return host;
}

function renderApp(): Promise<string> {
  return renderToString(
    withStubs(createSSRApp(appRoot(ref("default"), ref("home")))),
  );
}

function aside(host: ParentNode): HTMLElement | null {
  return host.querySelector<HTMLElement>("[data-dms-side-panel]");
}

function group(host: ParentNode): HTMLElement | null {
  return host.querySelector<HTMLElement>("[data-group]");
}

function press(target: Element | null | undefined, key: string): void {
  target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

beforeEach(() => {
  sharedState = new Map();
  cookies = new Map();
  loggedIn = ref(true);
  isDesktop = true;
  mountedPanels = 0;
  installRuntime();
  stubMatchMedia();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("side panel registry", () => {
  it("upserts by id and removes on unregister", () => {
    const { panels } = useAppSidePanels();
    registerSidePanel(panel("a"));
    registerSidePanel(panel("b"));
    registerSidePanel(panel("a", { ariaLabel: "Again" }));
    expect(panels.value.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(panels.value[1]?.ariaLabel).toBe("Again");
    unregisterSidePanel("b");
    expect(panels.value.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("holds plain data that survives the SSR payload", () => {
    const { panels } = useAppSidePanels();
    registerSidePanel(panel("a", { ariaLabel: "$demo.title", maxWidth: 600 }));
    expect(JSON.parse(JSON.stringify(panels.value))).toEqual(panels.value);
  });

  it("applies the width defaults and keeps the default inside the bounds", () => {
    expect(resolveSidePanelWidthBounds(panel("a"))).toEqual({
      defaultWidth: DEFAULT_WIDTH,
      minWidth: 320,
      maxWidth: 720,
    });
    expect(
      resolveSidePanelWidthBounds(
        panel("a", { defaultWidth: 900, maxWidth: 600 }),
      ),
    ).toEqual({ defaultWidth: 600, minWidth: 320, maxWidth: 600 });
  });

  it("mounts the side panel host as an app overlay", async () => {
    const { default: plugin } = await import(
      "../layers/dms-layout/app/plugins/side-panel-host"
    );
    (plugin as () => void)();
    expect(useDmsState(OVERLAYS_STATE_KEY).value).toEqual(["DmsSidePanelHost"]);
  });
});

describe("useSidePanel", () => {
  it("opens, closes and toggles, keeping the state in the cookie", () => {
    const assistant = useSidePanel("assistant");
    expect(assistant.isOpen.value).toBe(false);
    assistant.open();
    expect(assistant.isOpen.value).toBe(true);
    expect(preferences().openId).toBe("assistant");
    assistant.toggle();
    expect(preferences().openId).toBeNull();
    assistant.toggle();
    assistant.close();
    expect(assistant.isOpen.value).toBe(false);
  });

  it("keeps one panel open: opening one closes the other", () => {
    const first = useSidePanel("first");
    const second = useSidePanel("second");
    first.open();
    second.open();
    expect(first.isOpen.value).toBe(false);
    expect(second.isOpen.value).toBe(true);
    first.close();
    expect(second.isOpen.value).toBe(true);
  });

  it("shares the state between callers of the same id", () => {
    useSidePanel("assistant").open();
    expect(useSidePanel("assistant").isOpen.value).toBe(true);
  });

  it("reads a malformed cookie as nothing open", () => {
    storePreferences("garbage");
    expect(useSidePanel("assistant").isOpen.value).toBe(false);
    storePreferences({ openId: 3, widths: { a: "wide", b: 500 } });
    expect(preferences()).toEqual({ openId: null, widths: { b: 500 } });
  });
});

describe("side panel host on the server", () => {
  it("renders the open panel and reserves its width in the frame", async () => {
    registerSidePanel(panel("a", { ariaLabel: "Assistant" }));
    storePreferences({ openId: "a", widths: { a: 500 } });
    const markup = await renderApp();
    expect(markup).toContain("data-dms-side-panel");
    expect(markup).toContain('aria-label="Assistant"');
    expect(markup).toContain("data-panel-body");
    expect(markup).toContain(`${WIDTH_VARIABLE}:500px`);
    expect(markup).toContain("lg:end-[min(var(--dms-side-panel-width),60vw)]");
  });

  it("renders nothing, and reserves nothing, when no panel is open", async () => {
    registerSidePanel(panel("a"));
    const markup = await renderApp();
    expect(markup).not.toContain("data-dms-side-panel");
    expect(markup).not.toContain(WIDTH_VARIABLE);
  });

  it("renders nothing for a signed-out visitor or an unregistered panel", async () => {
    storePreferences({ openId: "gone", widths: {} });
    expect(await renderApp()).not.toContain("data-dms-side-panel");
    registerSidePanel(panel("a"));
    storePreferences({ openId: "a", widths: {} });
    loggedIn.value = false;
    expect(await renderApp()).not.toContain("data-dms-side-panel");
  });
});

describe("side panel host", () => {
  it("docks the panel at its width, the frame keeping the same room free", async () => {
    registerSidePanel(panel("a"));
    const host = mountApp();
    expect(aside(host)).toBeNull();
    expect(group(host)?.getAttribute("style")).toBeNull();

    useSidePanel("a").open();
    await nextTick();
    const width = `${DEFAULT_WIDTH}px`;
    expect(aside(host)?.style.getPropertyValue(WIDTH_VARIABLE)).toBe(width);
    expect(group(host)?.style.getPropertyValue(WIDTH_VARIABLE)).toBe(width);
    expect(aside(host)?.querySelector("[data-panel-body]")).not.toBeNull();
  });

  it("hides the panel on pages without the dashboard shell", async () => {
    registerSidePanel(panel("a"));
    useSidePanel("a").open();
    const host = mountApp();
    const wrapper = host.querySelector("[data-dms-side-panel-host]");
    expect(wrapper?.className).toContain(
      "[body:not(:has([data-dms-persistent-shell]))_&]:hidden",
    );
  });

  it("keeps the panel mounted across pages and layout changes", async () => {
    const layout = ref("default");
    const page = ref("home");
    registerSidePanel(panel("a"));
    useSidePanel("a").open();
    const host = mountApp(layout, page);
    const frame = group(host);
    page.value = "orders";
    await nextTick();
    layout.value = "settings";
    await nextTick();
    expect(group(host)).not.toBe(frame);
    expect(host.querySelector("article")?.textContent).toBe("orders");
    expect(mountedPanels).toBe(1);
  });

  it("resizes from the keyboard and stores the width in the cookie", async () => {
    registerSidePanel(panel("a"));
    useSidePanel("a").open();
    const host = mountApp();
    const handle = host.querySelector("[data-dms-side-panel-handle]");
    press(handle, "ArrowLeft");
    await nextTick();
    const widened = DEFAULT_WIDTH + SIDE_PANEL_KEYBOARD_STEP_PX;
    expect(handle?.getAttribute("aria-valuenow")).toBe(String(widened));
    expect(preferences().widths.a).toBe(widened);
    expect(group(host)?.style.getPropertyValue(WIDTH_VARIABLE)).toBe(
      `${widened}px`,
    );
    press(handle, "End");
    await nextTick();
    expect(handle?.getAttribute("aria-valuenow")).toBe("720");
    handle?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await nextTick();
    expect(preferences().widths.a).toBe(DEFAULT_WIDTH);
  });

  it("moves the page with the dragged handle and stores the width on release", async () => {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: () => {},
    });
    registerSidePanel(panel("a"));
    useSidePanel("a").open();
    const host = mountApp();
    const handle = host.querySelector("[data-dms-side-panel-handle]");
    const pointer = (type: string, clientX: number) =>
      handle?.dispatchEvent(new MouseEvent(type, { clientX, bubbles: true }));
    pointer("pointerdown", 1000);
    pointer("pointermove", 900);
    await nextTick();
    expect(group(host)?.style.getPropertyValue(WIDTH_VARIABLE)).toBe("540px");
    expect(preferences().widths.a).toBeUndefined();
    pointer("pointerup", 900);
    await nextTick();
    expect(preferences().widths.a).toBe(540);
  });

  it("reads back a stored width, clamped to the panel's bounds", async () => {
    storePreferences({ openId: "a", widths: { a: 9999 } });
    registerSidePanel(panel("a", { maxWidth: 600 }));
    const host = mountApp();
    expect(aside(host)?.style.getPropertyValue(WIDTH_VARIABLE)).toBe("600px");
  });

  it("does not close the docked panel on Escape", async () => {
    registerSidePanel(panel("a"));
    useSidePanel("a").open();
    const host = mountApp();
    press(aside(host), "Escape");
    expect(useSidePanel("a").isOpen.value).toBe(true);
  });
});

describe("side panel host below lg", () => {
  beforeEach(() => {
    isDesktop = false;
  });

  it("turns into a sheet over the page, above a backdrop", async () => {
    registerSidePanel(panel("a"));
    useSidePanel("a").open();
    const host = mountApp();
    const backdrop = host.querySelector("[data-dms-side-panel-backdrop]");
    expect(aside(host)?.className).toContain("max-lg:z-50");
    expect(backdrop?.className).toContain("lg:hidden");
    expect(document.activeElement).toBe(aside(host));
  });

  it("closes the panel on a backdrop click or Escape", async () => {
    registerSidePanel(panel("a"));
    const { open, isOpen } = useSidePanel("a");
    open();
    const host = mountApp();
    host.querySelector<HTMLElement>("[data-dms-side-panel-backdrop]")?.click();
    expect(isOpen.value).toBe(false);
    open();
    await nextTick();
    press(aside(host), "Escape");
    expect(isOpen.value).toBe(false);
  });

  it("gives focus back to where it was once the sheet closes", async () => {
    const launcher = document.createElement("button");
    document.body.append(launcher);
    launcher.focus();
    registerSidePanel(panel("a"));
    const { open, close } = useSidePanel("a");
    mountApp();
    open();
    await nextTick();
    expect(document.activeElement).not.toBe(launcher);
    close();
    await nextTick();
    expect(document.activeElement).toBe(launcher);
  });
});
