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
  type FunctionalComponent,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardFrame from "../layers/dms-layout/app/build/components/layout/DashboardFrame.vue";
import {
  nextOpenOrder,
  useActiveSidePanel,
} from "../layers/dms-layout/app/build/components/layout/sidePanelStack";
import {
  SIDE_PANEL_KEYBOARD_STEP_PX,
  SIDE_PANEL_WIDTH_STORAGE_PREFIX,
} from "../layers/dms-layout/app/build/composables/layout/useSidePanelWidth";
import {
  registerSidePanel,
  resolveSidePanelWidthBounds,
  type SidePanel,
  unregisterSidePanel,
  useAppSidePanels,
} from "../layers/dms-layout/app/composables/useAppSidePanels";
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

let sharedState: Map<string, Ref<unknown>>;
let isDesktop: boolean;
let mountedPanels: number;
let app: App | undefined;

function useDmsState<T>(key: string, init?: () => T): Ref<T> {
  if (!sharedState.has(key)) sharedState.set(key, ref(init?.()));
  return sharedState.get(key) as Ref<T>;
}

function panel(id: string, isOpen: Ref<boolean>, extra = {}): SidePanel {
  return {
    id,
    component: PANEL_COMPONENT,
    isOpen: () => isOpen.value,
    ...extra,
  };
}

const PanelBody = defineComponent({
  setup() {
    onMounted(() => {
      mountedPanels += 1;
    });
    return () => h("section", { "data-panel-body": "" }, "Assistant");
  },
});

const Group: FunctionalComponent = (_, { slots }) =>
  h("div", { "data-group": "" }, slots.default?.());

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
    resolveDmsComponent: () => undefined,
    useDmsState,
    useI18n: () => ({ t: (key: string) => key }),
    useTranslation: () => ({ processI18n: (value: string) => value }),
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

function mountFrame(page: Ref<string> = ref("home")): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  app = withStubs(
    createApp(() =>
      h(DashboardFrame, null, {
        default: () => h("article", { key: page.value }, page.value),
      }),
    ),
  );
  app.mount(host);
  return host;
}

beforeEach(() => {
  sharedState = new Map();
  isDesktop = true;
  mountedPanels = 0;
  localStorage.clear();
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
    registerSidePanel(panel("a", ref(false)));
    registerSidePanel(panel("b", ref(false)));
    registerSidePanel(panel("a", ref(false), { ariaLabel: "Again" }));
    expect(panels.value.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(panels.value[1]?.ariaLabel).toBe("Again");
    unregisterSidePanel("b");
    expect(panels.value.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("drops an entry whose callables the SSR payload stripped", () => {
    const { panels } = useAppSidePanels();
    const stripped = { id: "ssr", component: PANEL_COMPONENT } as SidePanel;
    useDmsState<SidePanel[]>("dms:side-panels", () => []).value = [stripped];
    expect(panels.value).toEqual([]);
  });

  it("follows isOpen reactively and skips a panel whose isOpen throws", () => {
    const isOpen = ref(false);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { openPanels } = useAppSidePanels();
    registerSidePanel(panel("a", isOpen));
    registerSidePanel({
      ...panel("broken", ref(true)),
      isOpen: () => {
        throw new Error("boom");
      },
    });
    expect(openPanels.value).toEqual([]);
    isOpen.value = true;
    expect(openPanels.value.map((entry) => entry.id)).toEqual(["a"]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("applies the width defaults and keeps the default inside the bounds", () => {
    expect(resolveSidePanelWidthBounds(panel("a", ref(true)))).toEqual({
      defaultWidth: 440,
      minWidth: 320,
      maxWidth: 720,
    });
    expect(
      resolveSidePanelWidthBounds(
        panel("a", ref(true), { defaultWidth: 900, maxWidth: 600 }),
      ),
    ).toEqual({ defaultWidth: 600, minWidth: 320, maxWidth: 600 });
  });
});

describe("active side panel", () => {
  it("orders open panels by opening, registration order breaking ties", () => {
    expect(nextOpenOrder([], ["a", "b"])).toEqual(["a", "b"]);
    expect(nextOpenOrder(["b"], ["a", "b"])).toEqual(["b", "a"]);
    expect(nextOpenOrder(["b", "a"], ["a"])).toEqual(["a"]);
  });

  it("shows the panel opened last and falls back when it closes", () => {
    const first = ref(true);
    const second = ref(false);
    registerSidePanel(panel("first", first));
    registerSidePanel(panel("second", second));
    const active = useActiveSidePanel();
    expect(active.value?.id).toBe("first");
    second.value = true;
    expect(active.value?.id).toBe("second");
    second.value = false;
    expect(active.value?.id).toBe("first");
    first.value = false;
    expect(active.value).toBeNull();
  });
});

describe("DashboardFrame side panel", () => {
  it("renders no panel on the server", async () => {
    registerSidePanel(panel("a", ref(true)));
    const markup = await renderToString(
      withStubs(createSSRApp(() => h(DashboardFrame))),
    );
    expect(markup).not.toContain("data-dms-side-panel");
  });

  it("docks the open panel after the page panel, at its default width", async () => {
    const isOpen = ref(false);
    registerSidePanel(panel("a", isOpen, { ariaLabel: "Assistant" }));
    const host = mountFrame();
    await nextTick();
    expect(host.querySelector("[data-dms-side-panel]")).toBeNull();

    isOpen.value = true;
    await nextTick();
    const aside = host.querySelector<HTMLElement>("[data-dms-side-panel]");
    expect(aside?.previousElementSibling?.previousElementSibling).toBe(
      host.querySelector("[data-page-panel]"),
    );
    expect(aside?.getAttribute("aria-label")).toBe("Assistant");
    expect(aside?.style.getPropertyValue("--dms-side-panel-width")).toBe(
      "440px",
    );
    expect(aside?.querySelector("[data-panel-body]")).not.toBeNull();
  });

  it("keeps the panel mounted while the page changes", async () => {
    const page = ref("home");
    registerSidePanel(panel("a", ref(true)));
    const host = mountFrame(page);
    await nextTick();
    page.value = "orders";
    await nextTick();
    expect(host.querySelector("article")?.textContent).toBe("orders");
    expect(mountedPanels).toBe(1);
  });

  it("resizes from the keyboard and remembers the width", async () => {
    registerSidePanel(panel("a", ref(true)));
    const host = mountFrame();
    await nextTick();
    const handle = host.querySelector<HTMLElement>(
      "[data-dms-side-panel-handle]",
    );
    handle?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
    );
    await nextTick();
    const widened = 440 + SIDE_PANEL_KEYBOARD_STEP_PX;
    expect(handle?.getAttribute("aria-valuenow")).toBe(String(widened));
    expect(localStorage.getItem(`${SIDE_PANEL_WIDTH_STORAGE_PREFIX}a`)).toBe(
      String(widened),
    );
    handle?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    await nextTick();
    expect(handle?.getAttribute("aria-valuenow")).toBe("720");
  });

  it("reads back a stored width, clamped to the panel's bounds", async () => {
    localStorage.setItem(`${SIDE_PANEL_WIDTH_STORAGE_PREFIX}a`, "9999");
    registerSidePanel(panel("a", ref(true), { maxWidth: 600 }));
    const host = mountFrame();
    await nextTick();
    const aside = host.querySelector<HTMLElement>("[data-dms-side-panel]");
    expect(aside?.style.getPropertyValue("--dms-side-panel-width")).toBe(
      "600px",
    );
  });

  it("does not close the docked panel on Escape", async () => {
    const onClose = vi.fn();
    registerSidePanel(panel("a", ref(true), { onClose }));
    const host = mountFrame();
    await nextTick();
    host
      .querySelector("[data-dms-side-panel]")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DashboardFrame side panel below lg", () => {
  beforeEach(() => {
    isDesktop = false;
  });

  it("turns into a sheet over the page, above a backdrop", async () => {
    registerSidePanel(panel("a", ref(true)));
    const host = mountFrame();
    await nextTick();
    const aside = host.querySelector("[data-dms-side-panel]");
    const backdrop = host.querySelector("[data-dms-side-panel-backdrop]");
    expect(aside?.className).toContain("max-lg:fixed");
    expect(backdrop?.className).toContain("lg:hidden");
    expect(document.activeElement).toBe(aside);
  });

  it("asks the module to close on a backdrop click or Escape", async () => {
    const onClose = vi.fn();
    registerSidePanel(panel("a", ref(true), { onClose }));
    const host = mountFrame();
    await nextTick();
    host.querySelector<HTMLElement>("[data-dms-side-panel-backdrop]")?.click();
    host
      .querySelector("[data-dms-side-panel]")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("gives focus back to where it was once the sheet closes", async () => {
    const isOpen = ref(false);
    const launcher = document.createElement("button");
    document.body.append(launcher);
    launcher.focus();
    registerSidePanel(panel("a", isOpen));
    mountFrame();
    isOpen.value = true;
    await nextTick();
    expect(document.activeElement).not.toBe(launcher);
    isOpen.value = false;
    await nextTick();
    expect(document.activeElement).toBe(launcher);
  });
});
