// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardHeader from "../layers/dms-layout/app/build/components/layout/DashboardHeader.vue";
import {
  BUILDER_ACTION_ID,
  type HeaderAction,
  registerHeaderAction,
  useHeaderActions,
} from "../layers/dms-layout/app/composables/useHeaderActions";
import { useSidePanel } from "../layers/dms-layout/app/composables/useSidePanel";

vi.mock(
  "../layers/dms-layout/app/build/components/notification/NotificationPopover.vue",
  () => ({ default: () => null }),
);
vi.mock(
  "../layers/dms-layout/app/build/components/layout/QuickActionsPopover.vue",
  () => ({ default: () => null }),
);
vi.mock("#dms-core/app/build/composables/page/usePageRecordLabel", () => ({
  usePageRecordLabel: () => ({ label: ref(null) }),
}));

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

function mountHeader(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp(DashboardHeader);
  app.component("UButton", ButtonStub);
  ["UDashboardNavbar", "UTooltip", "UBreadcrumb", "UDropdownMenu"].forEach(
    (name) => app?.component(name, SlotsStub),
  );
  app.mount(host);
  return host;
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
    const host = mountHeader();
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
    const host = mountHeader();
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
    const host = mountHeader();
    const builder = button(host, "Edit");
    builder?.click();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(builder?.dataset.color).toBe(ACTIVE_COLOR);
  });
});
