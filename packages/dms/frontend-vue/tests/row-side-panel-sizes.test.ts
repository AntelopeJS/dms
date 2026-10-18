// @vitest-environment jsdom
/**
 * A `sidePanel` action target's `size` and `overlay`: the row panel opens at
 * its size's width, over the page when it is an overlay, and keeps all a
 * docked panel offers (stepping, the position, the deep link, Escape).
 */
import {
  computed,
  createApp,
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
  type PropType,
  type Ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SidePanelHost from "../layers/dms-layout/app/build/components/layout/SidePanelHost.vue";
import RowSidePanel from "../layers/dms-layout/app/build/components/layout/RowSidePanel.vue";
import {
  readSidePanelPreferences,
  SIDE_PANEL_COOKIE,
} from "../layers/dms-layout/app/build/composables/layout/sidePanelState";
import {
  closeRowSidePanel,
  ROW_SIDE_PANEL_ID,
  rowSidePanelId,
  useRowSidePanelContent,
} from "../layers/dms-layout/app/build/composables/layout/rowSidePanel";
import { useAppSidePanels } from "../layers/dms-layout/app/composables/useAppSidePanels";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

const PANEL_COMPONENT = "RunPanel";
const ROW_PANEL_COMPONENT = "DmsRowSidePanel";
const DESKTOP_QUERY = "(min-width: 1024px)";

interface Row {
  _id: string;
  name: string;
}

let sharedState: Map<string, Ref<unknown>>;
let cookies: Map<string, Ref<unknown>>;
let app: App | undefined;

function useDmsState<T>(key: string, init?: () => T): Ref<T> {
  if (!sharedState.has(key)) sharedState.set(key, ref(init?.()));
  return sharedState.get(key) as Ref<T>;
}

function useDmsCookie<T>(
  name: string,
  options: { default?: () => unknown } = {},
): Ref<T> {
  if (!cookies.has(name)) cookies.set(name, ref(options.default?.() ?? null));
  return cookies.get(name) as Ref<T>;
}

const openPanelId = () =>
  readSidePanelPreferences(cookies.get(SIDE_PANEL_COOKIE)?.value).openId;

const RunPanel = defineComponent({
  props: {
    rowData: { type: Object as PropType<Row>, default: undefined },
    onSuccessCallback: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
  },
  setup(props) {
    return () =>
      h("p", { "data-run": "" }, [
        props.rowData?.name ?? "none",
        h("button", {
          "data-save": "",
          onClick: () => props.onSuccessCallback?.(),
        }),
      ]);
  },
});

const ButtonStub = defineComponent({
  props: { disabled: Boolean, ariaLabel: { type: String, default: undefined } },
  emits: ["click"],
  setup(props, { emit, attrs }) {
    return () =>
      h("button", {
        ...attrs,
        disabled: props.disabled,
        "aria-label": props.ariaLabel,
        onClick: () => emit("click"),
      });
  },
});

function installRuntime(): void {
  const runtime: Record<string, unknown> = {
    computed,
    onBeforeUnmount,
    onMounted,
    provide,
    ref,
    toRef,
    watch,
    markRaw: <T>(value: T) => value,
    useDmsCookie,
    useDmsState,
    Color: { success: "success" },
    HttpMethod: { post: "POST" },
    interpolateUrl: (url: string) => url,
    resolveDmsComponent: (name: string) =>
      name === PANEL_COMPONENT ? RunPanel : undefined,
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}(${params.index}/${params.total})` : key,
    }),
    useTranslation: () => ({
      processI18n: (value: string, params?: Record<string, unknown>) =>
        params ? `${value}(${params.index}/${params.total})` : value,
      processApiMessage: (value: string) => value,
    }),
    useDmsUserSession: () => ({ loggedIn: ref(true) }),
    useToast: () => ({ add: vi.fn() }),
    useModal: () => ({ open: vi.fn() }),
    useDrawer: () => ({ open: vi.fn() }),
    useExportJob: () => ({ runJob: vi.fn() }),
    useConfirm: () => ({ confirm: vi.fn(async () => true) }),
    useAuthFetch: () => ({ $authFetch: vi.fn() }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === DESKTOP_QUERY,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const rows: Row[] = [
  { _id: "r1", name: "First" },
  { _id: "r2", name: "Second" },
  { _id: "r3", name: "Third" },
];

const panelAction = (
  target: Partial<CustomRowAction["target"]> = {},
  action: Partial<CustomRowAction> = {},
): CustomRowAction => ({
  label: "Request",
  isDefault: true,
  target: {
    type: "sidePanel",
    component: { componentName: PANEL_COMPONENT },
    title: "Request details",
    ...target,
  } as CustomRowAction["target"],
  ...action,
});

interface Mounted {
  host: HTMLElement;
  targets: ReturnType<typeof useActionTargets>;
  showTable: Ref<boolean>;
}

type ReadRow = (id: string) => Promise<Row | undefined>;

function mountPanel(
  shownRows: Ref<Row[]> = ref(rows),
  getRow?: ReadRow,
): Mounted {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  const showTable = ref(true);
  const Table = defineComponent({
    setup() {
      targets = useActionTargets({
        api: vi.fn() as never,
        pageId: "requests-page",
        componentId: "requests",
        handleApiError: vi.fn(),
        rowNavigation: {
          rows: () => shownRows.value,
          rowIdKey: "_id",
          getRow,
        },
        recordScope: { tableId: "requests", isSoleTableView: true },
      });
      return () => h("table");
    },
  });
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp({
    render: () => [h(SidePanelHost), showTable.value ? h(Table) : null],
  });
  app.component("UButton", ButtonStub);
  app.component(ROW_PANEL_COMPONENT, RowSidePanel);
  app.mount(host);
  return { host, targets: targets!, showTable };
}

const settle = async () => {
  await nextTick();
  await nextTick();
};

const query = (host: ParentNode, selector: string) =>
  host.querySelector<HTMLElement>(selector);
const title = (host: ParentNode) => query(host, "h2")?.textContent?.trim();
const position = (host: ParentNode) =>
  query(host, "[data-dms-row-side-panel-position]")?.textContent?.trim();
const shownName = (host: ParentNode) =>
  query(host, "[data-run]")?.textContent?.trim();
const press = (key: string, target: EventTarget = window) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );

beforeEach(() => {
  sharedState = new Map();
  cookies = new Map();
  window.history.replaceState(null, "", "/requests");
  installRuntime();
});

afterEach(() => {
  closeRowSidePanel();
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const panelEl = (host: ParentNode) => query(host, "[data-dms-side-panel]");
const registered = () =>
  useAppSidePanels().panels.value.map(({ id, size, overlay }) => ({
    id,
    size,
    overlay,
  }));

describe("a sized row side panel", () => {
  it("keeps the plain id and today's width without a size", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(openPanelId()).toBe(ROW_SIDE_PANEL_ID);
    expect(
      panelEl(host)?.style.getPropertyValue("--dms-side-panel-width"),
    ).toBe("440px");
    expect(panelEl(host)?.dataset.overlay).toBeUndefined();
  });

  it("opens at its size's width, under an id of its own", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({ size: "3xl" }), rows[0]);
    await settle();
    expect(openPanelId()).toBe(rowSidePanelId("3xl"));
    expect(registered()).toEqual([
      { id: rowSidePanelId("3xl"), size: "3xl", overlay: undefined },
    ]);
    expect(
      panelEl(host)?.style.getPropertyValue("--dms-side-panel-width"),
    ).toBe("768px");
  });

  it("moves an open row of another size to its own panel, still open", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    targets.handleCustomRowAction(panelAction({ size: "xl" }), rows[1]);
    await settle();
    expect(openPanelId()).toBe(rowSidePanelId("xl"));
    expect(registered().map((entry) => entry.id)).toEqual([
      rowSidePanelId("xl"),
    ]);
    expect(shownName(host)).toBe("Second");
    expect(useRowSidePanelContent().value?.rowKey).toBe("r2");
  });
});

describe("an overlay row side panel", () => {
  const overlayAction = () =>
    panelAction({ overlay: true, size: "xl", deepLink: true });

  it.each([
    ["xl", "576px"],
    ["3xl", "768px"],
  ] as const)("opens over the page at %s's width (%s)", async (size, width) => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(
      panelAction({ overlay: true, size }),
      rows[0],
    );
    await settle();
    expect(panelEl(host)?.dataset.size).toBe(size);
    expect(
      panelEl(host)?.style.getPropertyValue("--dms-side-panel-width"),
    ).toBe(width);
  });

  it("slides over the page, its header and row as a docked one's", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(overlayAction(), rows[0]);
    await settle();
    expect(panelEl(host)?.dataset.overlay).toBe("true");
    expect(
      query(host, "[data-dms-side-panel-backdrop]")?.className,
    ).not.toContain("lg:hidden");
    expect(title(host)).toBe("Request details");
    expect(position(host)).toBe("side_panel.position(1/3)");
    expect(shownName(host)).toBe("First");
  });

  it("steps through the rows with J and K, keeping the row in the URL", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(overlayAction(), rows[0]);
    await settle();
    expect(window.location.search).toBe("?record=r1");
    press("j");
    await settle();
    expect(shownName(host)).toBe("Second");
    expect(position(host)).toBe("side_panel.position(2/3)");
    expect(window.location.search).toBe("?record=r2");
    press("k");
    await settle();
    expect(shownName(host)).toBe("First");
  });

  it("closes on Escape, removing the row from the URL", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(overlayAction(), rows[0]);
    await settle();
    press("Escape");
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(openPanelId()).toBeNull();
    expect(panelEl(host)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("closes on a click on the backdrop", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(overlayAction(), rows[0]);
    await settle();
    query(host, "[data-dms-side-panel-backdrop]")?.click();
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("moves focus into the panel while it is open", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(overlayAction(), rows[0]);
    await settle();
    expect(panelEl(host)?.contains(document.activeElement)).toBe(true);
  });
});
