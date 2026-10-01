// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  ref,
  type App,
  type PropType,
  type Ref,
  type VNode,
} from "vue";
import type { NavigationMenuItem } from "@nuxt/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPreviewEntryStates,
  type PermissionPreviewResult,
  type PreviewEntryState,
  type PreviewLockableEntry,
  resolvePreviewEntryState,
} from "#dms-core/app/utils/permission-preview";
import { MENU_STATUS_TEXT_CLASSES } from "#dms-core/app/utils/menu";
import NavigationMenu from "../layers/dms-layout/app/components/navigation/NavigationMenu.vue";

// "Preview as role": an entry the previewed role opens without all of it (a
// block, an action or one of its entries lost) is drawn with the orange hatch
// and lock; one it cannot open keeps the red ones. Never outside a preview.

const HIDDEN = new Set(["pages.sales.invoices"]);
const PARTIAL = new Set(["pages.sales", "pages.sales.orders", "settings"]);

describe("resolvePreviewEntryState", () => {
  it("draws refused and partial entries only while a preview runs", () => {
    expect(resolvePreviewEntryState(true, HIDDEN, PARTIAL, "settings")).toBe(
      "partial",
    );
    expect(
      resolvePreviewEntryState(true, HIDDEN, PARTIAL, "pages.sales.invoices"),
    ).toBe("hidden");
    expect(resolvePreviewEntryState(true, HIDDEN, PARTIAL, "modules")).toBe(
      null,
    );
    expect(resolvePreviewEntryState(true, HIDDEN, PARTIAL, undefined)).toBe(
      null,
    );
    expect(resolvePreviewEntryState(false, HIDDEN, PARTIAL, "settings")).toBe(
      null,
    );
  });

  it("never draws a refused entry as partial", () => {
    const both = new Set(["pages.sales.invoices"]);
    expect(
      resolvePreviewEntryState(true, both, both, "pages.sales.invoices"),
    ).toBe("hidden");
  });
});

describe("applyPreviewEntryStates", () => {
  interface Entry extends PreviewLockableEntry {
    label: string;
    state?: PreviewEntryState;
    children?: Entry[];
  }
  const MENU: Entry[] = [
    {
      label: "Sales",
      fullId: "pages.sales",
      children: [
        { label: "Orders", fullId: "pages.sales.orders" },
        { label: "Invoices", fullId: "pages.sales.invoices" },
      ],
    },
    { label: "Settings", fullId: "settings" },
    { label: "Modules", fullId: "modules" },
  ];
  const statesOf = (entries: Entry[]): string[] =>
    entries.flatMap((entry) => [
      ...(entry.state ? [`${entry.label}:${entry.state}`] : []),
      ...statesOf(entry.children ?? []),
    ]);

  it("passes each entry its state, nested entries included", () => {
    const drawn = applyPreviewEntryStates(
      MENU,
      (fullId) => resolvePreviewEntryState(true, HIDDEN, PARTIAL, fullId),
      (entry, state) => ({ ...entry, state }),
    );
    expect(statesOf(drawn)).toEqual([
      "Sales:partial",
      "Orders:partial",
      "Invoices:hidden",
      "Settings:partial",
    ]);
  });

  it("draws nothing outside a preview", () => {
    const drawn = applyPreviewEntryStates(
      MENU,
      (fullId) => resolvePreviewEntryState(false, HIDDEN, PARTIAL, fullId),
      (entry, state) => ({ ...entry, state }),
    );
    expect(statesOf(drawn)).toEqual([]);
  });
});

describe("NavigationMenu in a role preview", () => {
  const WARNING_HATCH = "var(--ui-warning)";
  const ERROR_HATCH = "var(--ui-error)";
  const ITEMS: NavigationMenuItem[] = [
    {
      label: "Sales",
      fullId: "pages.sales",
      icon: "i-ph-chart-line",
      children: [
        { label: "Orders", fullId: "pages.sales.orders", to: "/orders" },
        { label: "Invoices", fullId: "pages.sales.invoices", to: "/invoices" },
      ],
    },
    { label: "Reports", fullId: "pages.reports", to: "/reports" },
  ];
  const RESULT: PermissionPreviewResult = {
    page: null,
    blocks: {},
    hiddenEntries: ["pages.sales.invoices"],
    partialEntries: ["pages.sales", "pages.sales.orders"],
    outOfScope: 0,
  };

  let app: App | undefined;
  let host: HTMLDivElement;
  let state: Map<string, Ref<unknown>>;

  // Renders each item the way UNavigationMenu hands them over: its classes,
  // its title and the trailing icon's classes, nested items included.
  const MenuStub = defineComponent({
    props: {
      items: {
        type: Array as PropType<NavigationMenuItem[][]>,
        required: true,
      },
    },
    setup(props) {
      const renderItem = (item: NavigationMenuItem): VNode =>
        h("div", { "data-entry": item.fullId }, [
          h(
            "a",
            {
              class: item.class,
              title: item.title,
              "data-state": item.previewState,
              "data-trailing": item.trailingIcon,
              "data-trailing-class": item.ui?.linkTrailingIcon,
            },
            item.label,
          ),
          ...(item.children ?? []).map(renderItem),
        ]);
      return () => h("nav", props.items.flat().map(renderItem));
    },
  });

  function mount(previewing: boolean) {
    state.set(
      "dms-permission-preview-session",
      ref(
        previewing
          ? {
              id: "p1",
              roleId: "r1",
              roleName: "Support",
              permissions: [],
              unsaved: false,
              returnTo: "/settings/roles",
              updatedAt: 0,
            }
          : null,
      ),
    );
    // A stale result alone never draws anything: only a running preview does.
    state.set("dms-permission-preview-result", ref(RESULT));
    app = createApp(NavigationMenu, { items: ITEMS });
    app.component("UNavigationMenu", MenuStub);
    app.mount(host);
  }

  const entry = (fullId: string): HTMLAnchorElement =>
    host.querySelector(`[data-entry="${fullId}"] > a`)!;

  beforeEach(() => {
    state = new Map();
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useI18n", () => ({
      t: (key: string, values?: { role?: string }) =>
        values?.role ? `${key}(${values.role})` : key,
    }));
    vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
      if (!state.has(key)) state.set(key, ref(initial()));
      return state.get(key);
    });
    vi.stubGlobal("usePrefetch", () => ({ prefetchPageLayout: vi.fn() }));
    vi.stubGlobal("stripQueryAndHash", (path: string) => path);
    vi.stubGlobal("MENU_STATUS_TEXT_CLASSES", MENU_STATUS_TEXT_CLASSES);
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host.remove();
    vi.unstubAllGlobals();
  });

  it("draws a partial entry and its group orange, a refused one red", () => {
    mount(true);
    const orders = entry("pages.sales.orders");
    expect(orders.dataset.state).toBe("partial");
    expect(orders.className).toContain(WARNING_HATCH);
    expect(orders.className).not.toContain(ERROR_HATCH);
    expect(orders.dataset.trailing).toBe("i-ph-lock-simple");
    expect(orders.dataset.trailingClass).toContain("text-warning");
    expect(orders.title).toBe(
      "page.settings.roles.preview.menu_partial(Support)",
    );

    const sales = entry("pages.sales");
    expect(sales.dataset.state).toBe("partial");
    expect(sales.className).toContain(WARNING_HATCH);

    const invoices = entry("pages.sales.invoices");
    expect(invoices.dataset.state).toBe("hidden");
    expect(invoices.className).toContain(ERROR_HATCH);
    expect(invoices.dataset.trailingClass).toContain("text-error");

    const reports = entry("pages.reports");
    expect(reports.dataset.state).toBeUndefined();
    expect(reports.className).not.toContain(WARNING_HATCH);
  });

  it("draws no partial state outside a preview", () => {
    mount(false);
    for (const fullId of [
      "pages.sales",
      "pages.sales.orders",
      "pages.sales.invoices",
      "pages.reports",
    ]) {
      const link = entry(fullId);
      expect(link.dataset.state).toBeUndefined();
      expect(link.className).not.toContain(WARNING_HATCH);
      expect(link.className).not.toContain(ERROR_HATCH);
      expect(link.dataset.trailing).toBeUndefined();
    }
  });
});

describe("PermissionVeil partial state (settings overview cards)", () => {
  let app: App | undefined;
  let host: HTMLDivElement;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host.remove();
  });

  it("keeps the card usable under an orange hatch with the lock badge", async () => {
    const { default: PermissionVeil } = await import(
      "../layers/dms-ui/app/components/permission/PermissionVeil.vue"
    );
    host = document.createElement("div");
    document.body.append(host);
    const Stub = defineComponent({
      props: { name: { type: String, default: undefined } },
      setup:
        (props, { slots }) =>
        () =>
          h("span", { "data-icon": props.name }, slots.default?.()),
    });
    app = createApp(() =>
      h(
        PermissionVeil,
        { state: "partial", label: "Partial access", persistent: true },
        () => h("a", { class: "card", href: "/settings/user/members" }),
      ),
    );
    app.component("UTooltip", Stub);
    app.component("UIcon", Stub);
    app.mount(host);

    const root = host.querySelector("[data-permission-veil]")!;
    expect(root.getAttribute("data-permission-veil")).toBe("partial");
    expect(root.querySelector("[inert]")).toBeNull();
    const veil = root.querySelector(".absolute.inset-0")!;
    expect(veil.className).toContain("pointer-events-none");
    expect(veil.className).toContain("var(--ui-warning)");
    expect(root.querySelector('[data-icon="i-ph-lock-simple"]')).not.toBeNull();
    expect(root.textContent).toContain("Partial access");
  });
});
