// @vitest-environment jsdom
/**
 * The `sidePanel` action target: a non-modal panel docked on the right that
 * opens a module's component on a row, the DMS drawing its header (title,
 * position among the rows shown, previous / next, J / K, close, Escape), and
 * the table's `rowClick: "single"` mode that opens it on a single click.
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
import { tv } from "tailwind-variants";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SidePanelHost from "../layers/dms-layout/app/build/components/layout/SidePanelHost.vue";
import RowSidePanel from "../layers/dms-layout/app/build/components/layout/RowSidePanel.vue";
import RecursiveComponent from "../layers/dms-ui/app/components/RecursiveComponent.vue";
import {
  readSidePanelPreferences,
  SIDE_PANEL_COOKIE,
} from "../layers/dms-layout/app/build/composables/layout/sidePanelState";
import {
  closeRowSidePanel,
  ROW_SIDE_PANEL_ID,
  useRowSidePanelContent,
} from "../layers/dms-layout/app/build/composables/layout/rowSidePanel";
import { useAppSidePanels } from "../layers/dms-layout/app/composables/useAppSidePanels";
import { useSidePanel } from "../layers/dms-layout/app/composables/useSidePanel";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import {
  isDeepLinkAction,
  resolveDeepLinkedRow,
} from "../layers/dms-ui/app/build/composables/table-view/utils/recordLink";
import { isRowClickTrigger } from "../layers/dms-ui/app/build/utils/rowClickTrigger";
import { EYEBROW_CLASS } from "../layers/dms-ui/app/build/utils/eyebrow";
import { REORDER_HANDLE_CLASS } from "../layers/dms-ui/app/build/composables/table-view/useReorderHandles";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";

vi.mock("#dms-core/app/build/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    blockFor: () => undefined,
    isActive: { value: false },
    session: { value: null },
  }),
}));

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
let panelMounts: number;
let refreshes: number;

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
    onMounted(() => {
      panelMounts += 1;
    });
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
        refreshCallback: () => {
          refreshes += 1;
        },
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
  app.component("DmsRecursiveComponent", RecursiveComponent);
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
  panelMounts = 0;
  refreshes = 0;
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

describe("sidePanel action target", () => {
  it("opens a docked panel on the row, the DMS drawing its header", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(openPanelId()).toBe(ROW_SIDE_PANEL_ID);
    expect(
      query(host, "[data-dms-side-panel]")?.getAttribute("aria-label"),
    ).toBe("Request details");
    expect(title(host)).toBe("Request details");
    expect(position(host)).toBe("side_panel.position(1/3)");
    expect(shownName(host)).toBe("First");
    expect(useRowSidePanelContent().value?.rowKey).toBe("r1");
  });

  it("words the position with the action's own label", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(
      panelAction({ positionLabel: "$api.drawer.position" }),
      rows[1],
    );
    await settle();
    expect(position(host)).toBe("$api.drawer.position(2/3)");
  });

  it("titles the panel with the action's label when the target sets none", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({ title: undefined }), rows[0]);
    await settle();
    expect(title(host)).toBe("Request");
  });

  it("closes a module's side panel: one panel at a time", async () => {
    const { targets } = mountPanel();
    useSidePanel("assistant").open();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(openPanelId()).toBe(ROW_SIDE_PANEL_ID);
  });
});

describe("row side panel navigation", () => {
  it("steps with the buttons, swapping the component in place", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const prev = query(host, "[data-dms-row-side-panel-prev]");
    expect(prev?.hasAttribute("disabled")).toBe(true);
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(shownName(host)).toBe("Second");
    expect(position(host)).toBe("side_panel.position(2/3)");
    expect(panelMounts).toBe(2);
    expect(useRowSidePanelContent().value?.rowKey).toBe("r2");
  });

  it("steps with J and K and stops at the bounds", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[1]);
    await settle();
    press("j");
    await settle();
    expect(shownName(host)).toBe("Third");
    expect(
      query(host, "[data-dms-row-side-panel-next]")?.hasAttribute("disabled"),
    ).toBe(true);
    press("j");
    await settle();
    expect(shownName(host)).toBe("Third");
    press("k");
    press("k");
    await settle();
    expect(shownName(host)).toBe("First");
    press("k");
    await settle();
    expect(position(host)).toBe("side_panel.position(1/3)");
  });

  it("ignores J and K typed into a field", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const input = document.createElement("input");
    document.body.append(input);
    press("j", input);
    await settle();
    expect(shownName(host)).toBe("First");
  });

  it("follows the rows the table shows", async () => {
    const shown = ref([...rows]);
    const { host, targets } = mountPanel(shown);
    targets.handleCustomRowAction(panelAction(), rows[1]);
    await settle();
    shown.value = [rows[1]!];
    await settle();
    expect(position(host)).toBe("side_panel.position(1/1)");
    shown.value = [rows[0]!];
    await settle();
    expect(position(host)).toBeUndefined();
    expect(query(host, "[data-dms-row-side-panel-next]")).toBeNull();
    expect(shownName(host)).toBe("Second");
  });
});

describe("row tokens in a row panel's component options", () => {
  // A block declared on the backend (a ResourceForm in view mode) reads its
  // row from its options, not from `rowData`.
  const BlockPanel = defineComponent({
    props: {
      fetchUrl: { type: String, default: undefined },
      rowId: { type: String, default: undefined },
      heading: {
        type: Object as PropType<{ text: string }>,
        default: undefined,
      },
    },
    setup(props) {
      return () =>
        h("p", { "data-block": "" }, [
          `${props.fetchUrl}|${props.rowId}|${props.heading?.text}`,
        ]);
    },
  });
  const blockAction = () =>
    panelAction({
      component: {
        componentName: "BlockPanel",
        options: {
          fetchUrl: "/api/runs/get?id={{row._id}}&site={{query.site}}",
          rowId: "{{row.id}}",
          heading: { text: "{{row.name}} run" },
        },
      },
    } as Partial<CustomRowAction["target"]>);
  const shownBlock = (host: ParentNode) =>
    query(host, "[data-block]")?.textContent?.trim();

  beforeEach(() => {
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "BlockPanel" ? BlockPanel : undefined,
    );
  });

  it("fills them with the row shown, again on each step and showRow", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(blockAction(), rows[0]);
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r1&site={{query.site}}|r1|First run",
    );
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r2&site={{query.site}}|r2|Second run",
    );
    press("j");
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r3&site={{query.site}}|r3|Third run",
    );
    await useRowSidePanelContent().value?.showRow?.(rows[0]!);
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=r1&site={{query.site}}|r1|First run",
    );
  });

  it("encodes a URL option's value, and leaves another as it is", async () => {
    const { host, targets } = mountPanel(ref([{ _id: "a b", name: "A/B" }]));
    targets.handleCustomRowAction(blockAction(), { _id: "a b", name: "A/B" });
    await settle();
    expect(shownBlock(host)).toBe(
      "/api/runs/get?id=a%20b&site={{query.site}}|a b|A/B run",
    );
  });
});

describe("a container block as a row panel's component", () => {
  // A Card holding blocks: its body and its footer are slots the children
  // are mounted in.
  const CardStub = defineComponent({
    props: {
      title: { type: String, default: undefined },
      rowData: { type: Object as PropType<Row>, default: undefined },
    },
    setup(props, { slots }) {
      return () =>
        h("section", { "data-card": "" }, [
          h("h3", `${props.title}|${props.rowData?.name}`),
          h("div", { "data-body": "" }, slots.default?.()),
          h("footer", slots.footer?.()),
        ]);
    },
  });
  const StackStub = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", { "data-stack": "" }, slots.default?.()),
  });
  const FactsStub = defineComponent({
    props: { fetchUrl: { type: String, default: undefined } },
    setup: (props) => () => h("dl", { "data-facts": "" }, props.fetchUrl),
  });
  const blocks: Record<string, unknown> = { CardStub, StackStub, FactsStub };
  const cardAction = () =>
    panelAction({
      component: {
        componentName: "CardStub",
        options: { title: "{{row.name}} facts" },
        children: [
          {
            id: "facts",
            component: {
              componentName: "FactsStub",
              options: { fetchUrl: "/x/{{row._id}}" },
            },
          },
          {
            id: "stack",
            component: {
              componentName: "StackStub",
              children: [
                {
                  id: "nested",
                  component: {
                    componentName: "FactsStub",
                    options: { fetchUrl: "/y/{{row.id}}?name={{row.name}}" },
                  },
                },
              ],
            },
          },
          {
            id: "note",
            slot: "footer",
            component: {
              componentName: "FactsStub",
              options: { fetchUrl: "/notes/{{row._id}}" },
            },
          },
        ],
      },
    } as Partial<CustomRowAction["target"]>);
  const shownCard = (host: ParentNode) => ({
    heading: query(host, "[data-card] h3")?.textContent,
    body: [...host.querySelectorAll("[data-body] [data-facts]")].map(
      (facts) => facts.textContent,
    ),
    nested: query(host, "[data-stack] [data-facts]")?.textContent,
    footer: query(host, "[data-card] footer [data-facts]")?.textContent,
  });

  beforeEach(() => {
    vi.stubGlobal("resolveDmsComponent", (name: string) => blocks[name]);
  });

  it("mounts its children, filled with the row shown, again on each step", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(cardAction(), rows[0]);
    await settle();
    expect(shownCard(host)).toEqual({
      heading: "First facts|First",
      body: ["/x/r1", "/y/r1?name=First"],
      nested: "/y/r1?name=First",
      footer: "/notes/r1",
    });
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(shownCard(host)).toEqual({
      heading: "Second facts|Second",
      body: ["/x/r2", "/y/r2?name=Second"],
      nested: "/y/r2?name=Second",
      footer: "/notes/r2",
    });
  });
});

describe("row side panel deep link", () => {
  it("keeps the open row in the URL, following the steps", async () => {
    const { targets } = mountPanel();
    const action = panelAction({ deepLink: true });
    expect(isDeepLinkAction(action)).toBe(true);
    targets.handleCustomRowAction(action, rows[0]);
    await settle();
    expect(window.location.search).toBe("?record=r1");
    press("j");
    await settle();
    expect(window.location.search).toBe("?record=r2");
    closeRowSidePanel();
    expect(window.location.search).toBe("");
  });

  it("keeps the row in the URL by default, deepLink: false opting out", async () => {
    expect(isDeepLinkAction(panelAction())).toBe(true);
    expect(isDeepLinkAction(panelAction({ deepLink: false }))).toBe(false);
    expect(isDeepLinkAction(panelAction({}, { deepLink: false }))).toBe(false);
    expect(
      isDeepLinkAction(panelAction({ deepLink: false }, { deepLink: true })),
    ).toBe(true);
    const drawer = panelAction({
      type: "drawer",
    } as Partial<CustomRowAction["target"]>);
    expect(isDeepLinkAction(drawer)).toBe(false);

    const { targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(window.location.search).toBe("?record=r1");
    closeRowSidePanel();
    targets.handleCustomRowAction(panelAction({ deepLink: false }), rows[0]);
    await settle();
    expect(window.location.search).toBe("");
  });

  it("leaves the next page's ?record= alone when it closes on the way out", async () => {
    const { targets, showTable } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    expect(window.location.search).toBe("?record=r1");
    window.history.pushState(null, "", "/runs?record=run-5");
    showTable.value = false;
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(window.location.pathname).toBe("/runs");
    expect(window.location.search).toBe("?record=run-5");
  });

  it("leaves a ?record= another row wrote on the same page alone", async () => {
    const { targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    window.history.replaceState(null, "", "/requests?record=other");
    closeRowSidePanel();
    expect(window.location.search).toBe("?record=other");
  });
});

describe("deep link to a row the table does not list", () => {
  const older: Row = { _id: "r9", name: "Older" };
  const idOf = (row: Row) => row._id;

  it("reads a row beyond the first page by id", async () => {
    const getRow = vi.fn(async () => older);
    expect(
      await resolveDeepLinkedRow("r9", { listed: rows, idOf, getRow }),
    ).toEqual({ row: older, isMissing: false });
    expect(getRow).toHaveBeenCalledWith("r9");
  });

  it("takes a listed row as it is, without a request", async () => {
    const getRow = vi.fn(async () => older);
    const found = await resolveDeepLinkedRow("r2", {
      listed: rows,
      idOf,
      getRow,
    });
    expect(found.row).toBe(rows[1]);
    expect(getRow).not.toHaveBeenCalled();
  });

  it("marks a row its route answers 404 for as missing", async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("Not Found"), { statusCode: 404 });
    });
    expect(
      await resolveDeepLinkedRow("gone", {
        listed: rows,
        idOf,
        getRow: missing,
      }),
    ).toEqual({ isMissing: true });
  });

  it("marks a refused read as failed and finds nothing without a row route", async () => {
    const refused = async () => {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    };
    expect(
      await resolveDeepLinkedRow("r9", { listed: rows, idOf, getRow: refused }),
    ).toEqual({ isMissing: false, isFailed: true });
    const noRoute = async () => undefined;
    expect(
      await resolveDeepLinkedRow("r9", { listed: rows, idOf, getRow: noRoute }),
    ).toEqual({ row: undefined, isMissing: false });
  });

  it("opens the unlisted row without a position, J and K inert", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({ deepLink: true }), older);
    await settle();
    expect(shownName(host)).toBe("Older");
    expect(position(host)).toBeUndefined();
    expect(query(host, "[data-dms-row-side-panel-next]")).toBeNull();
    expect(window.location.search).toBe("?record=r9");
    press("j");
    await settle();
    expect(shownName(host)).toBe("Older");
  });
});

describe("showing another row from the panel", () => {
  const older: Row = { _id: "r9", name: "Older" };
  const notFoundError = () =>
    Object.assign(new Error("Not Found"), { statusCode: 404 });
  const showRow = (rowOrId: Row | string) =>
    (
      useRowSidePanelContent().value?.componentOptions.showRow as (
        rowOrId: Row | string,
      ) => Promise<void>
    )(rowOrId);

  it("moves the highlight, the position and ?record= onto a listed row", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await showRow("r3");
    await settle();
    expect(shownName(host)).toBe("Third");
    expect(position(host)).toBe("side_panel.position(3/3)");
    expect(useRowSidePanelContent().value?.rowKey).toBe("r3");
    expect(window.location.search).toBe("?record=r3");
    await showRow(rows[1]!);
    await settle();
    expect(position(host)).toBe("side_panel.position(2/3)");
  });

  it("reads an unlisted row by id, shown without a position", async () => {
    const getRow = vi.fn(async () => older);
    const { host, targets } = mountPanel(ref(rows), getRow);
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await showRow("r9");
    await settle();
    expect(getRow).toHaveBeenCalledWith("r9");
    expect(shownName(host)).toBe("Older");
    expect(position(host)).toBeUndefined();
    expect(useRowSidePanelContent().value?.rowKey).toBe("r9");
    expect(window.location.search).toBe("?record=r9");
  });

  it("says a row its route answers 404 for is gone", async () => {
    const { host, targets } = mountPanel(ref(rows), async () => {
      throw notFoundError();
    });
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await showRow("gone");
    await settle();
    expect(query(host, "[data-dms-row-side-panel-not-found]")).not.toBeNull();
    expect(useRowSidePanelContent().value?.rowKey).toBeUndefined();
    expect(window.location.search).toBe("?record=gone");
  });

  it("rejects a row it cannot read, keeping the row it shows", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    await expect(showRow("r9")).rejects.toThrow("r9");
    await settle();
    expect(shownName(host)).toBe("First");
    expect(window.location.search).toBe("?record=r1");
  });

  it("leaves the panel shut when it closed while the row was read", async () => {
    let answer!: (row: Row) => void;
    const { host, targets } = mountPanel(
      ref(rows),
      () => new Promise((resolve) => (answer = resolve)),
    );
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const shown = showRow("r9");
    closeRowSidePanel();
    answer(older);
    await shown;
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(window.location.search).toBe("");
  });
});

describe("side panel on a missing row", () => {
  const notFound = (host: ParentNode) =>
    query(host, "[data-dms-row-side-panel-not-found]");

  it("says the row is gone under the target's title, with the DMS's words", async () => {
    window.history.replaceState(null, "", "/requests?record=gone");
    const { host, targets } = mountPanel();
    targets.handleMissingRow(panelAction(), "gone");
    await settle();
    expect(openPanelId()).toBe(ROW_SIDE_PANEL_ID);
    expect(title(host)).toBe("Request details");
    expect(position(host)).toBeUndefined();
    expect(shownName(host)).toBeUndefined();
    expect(notFound(host)?.textContent).toContain(
      "$side_panel.not_found.title",
    );
    expect(notFound(host)?.textContent).toContain(
      "$side_panel.not_found.description",
    );
  });

  it("takes the target's own not-found words", async () => {
    const { host, targets } = mountPanel();
    targets.handleMissingRow(
      panelAction({
        notFound: {
          title: "$api.request.not_found_title",
          description: "$api.request.not_found_description",
        },
      }),
      "gone",
    );
    await settle();
    expect(notFound(host)?.textContent).toContain(
      "$api.request.not_found_title",
    );
    expect(notFound(host)?.textContent).toContain(
      "$api.request.not_found_description",
    );
  });

  it("closes from its state, removing the link's ?record=", async () => {
    window.history.replaceState(null, "", "/requests?record=gone");
    const { host, targets } = mountPanel();
    targets.handleMissingRow(panelAction(), "gone");
    await settle();
    notFound(host)?.querySelector("button")?.click();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("opens nothing for a drawer action", async () => {
    const { host, targets } = mountPanel();
    targets.handleMissingRow(
      panelAction({ type: "drawer" } as Partial<CustomRowAction["target"]>),
      "gone",
    );
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
  });
});

describe("row side panel title from the row", () => {
  it("names the open row with the target's rowTitle and its fields", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(
      panelAction({ rowTitle: "{name} ({_id})" }),
      rows[0],
    );
    await settle();
    expect(title(host)).toBe("First (r1)");
    expect(
      query(host, "[data-dms-side-panel]")?.getAttribute("aria-label"),
    ).toBe("Request details");
    query(host, "[data-dms-row-side-panel-next]")?.click();
    await settle();
    expect(title(host)).toBe("Second (r2)");
  });
});

describe("closing the row side panel", () => {
  it("closes from its button, unregistering the panel", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction({ deepLink: true }), rows[0]);
    await settle();
    query(host, "[data-dms-row-side-panel-close]")?.click();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(openPanelId()).toBeNull();
    expect(useAppSidePanels().panels.value).toEqual([]);
    expect(useRowSidePanelContent().value).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("closes on Escape, unless a field or another layer takes the key", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    const input = document.createElement("input");
    document.body.append(input);
    press("Escape", input);
    const handled = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    handled.preventDefault();
    window.dispatchEvent(handled);
    await settle();
    expect(query(host, "[data-dms-side-panel]")).not.toBeNull();
    press("Escape");
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
  });

  it("closes when another side panel opens, and when its table goes", async () => {
    const { host, targets, showTable } = mountPanel();
    targets.handleCustomRowAction(panelAction({ deepLink: true }), rows[0]);
    await settle();
    useSidePanel("assistant").open();
    await settle();
    expect(useRowSidePanelContent().value).toBeNull();
    expect(window.location.search).toBe("");
    expect(openPanelId()).toBe("assistant");

    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    showTable.value = false;
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(openPanelId()).toBeNull();
  });

  it("closes and refreshes the table once the component saved", async () => {
    const { host, targets } = mountPanel();
    targets.handleCustomRowAction(panelAction(), rows[0]);
    await settle();
    query(host, "[data-save]")?.click();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
    expect(refreshes).toBe(1);
  });

  it("shows no empty panel for a stale cookie naming it", async () => {
    useDmsCookie(SIDE_PANEL_COOKIE).value = {
      openId: ROW_SIDE_PANEL_ID,
      widths: {},
    };
    const { host } = mountPanel();
    await settle();
    expect(query(host, "[data-dms-side-panel]")).toBeNull();
  });
});

describe("row click mode", () => {
  type Mode = "single" | "double" | undefined;

  // Whether `type` dispatched on the row's cell (or on `inner`, its content)
  // runs the row action; read while the event is on the row, whose
  // `currentTarget` the guards read.
  const triggers = (
    mode: Mode,
    type: string,
    init: MouseEventInit = {},
    inner?: string,
  ): boolean => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    row.append(cell);
    if (inner) cell.innerHTML = inner;
    document.body.append(row);
    let result = false;
    row.addEventListener(type, (event) => {
      result = isRowClickTrigger(mode, event as MouseEvent);
    });
    const target = cell.firstElementChild ?? cell;
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
    row.remove();
    return result;
  };
  const expectTrigger = (
    mode: Mode,
    type: string,
    expected: boolean,
    init: MouseEventInit = {},
    inner?: string,
  ) => expect(triggers(mode, type, init, inner)).toBe(expected);

  it("runs the row action on a double-click by default", () => {
    expectTrigger(undefined, "dblclick", true);
    expectTrigger(undefined, "click", false, { detail: 1 });
    expectTrigger("double", "dblclick", true);
  });

  it("runs it on a single click with rowClick: single", () => {
    expectTrigger("single", "click", true, { detail: 1 });
    expectTrigger("single", "dblclick", false);
    expectTrigger("single", "click", false, { detail: 2 });
  });

  it("leaves a single click on a control of the row to the control", () => {
    expectTrigger(
      "single",
      "click",
      false,
      { detail: 1 },
      "<button>Menu</button>",
    );
    expectTrigger(
      "single",
      "click",
      false,
      { detail: 1 },
      '<a href="#">Link</a>',
    );
    expectTrigger("single", "click", true, { detail: 1 }, "<span>Text</span>");
  });

  it("leaves a click ending a text selection alone", () => {
    const text = document.createElement("p");
    text.textContent = "GET /api/search";
    document.body.append(text);
    window.getSelection()?.selectAllChildren(text);
    expectTrigger("single", "click", false, { detail: 1 });
    window.getSelection()?.removeAllRanges();
    text.remove();
  });
});

describe("open row highlight", () => {
  const tableSource = readFileSync(
    resolve(__dirname, "../layers/dms-ui/app/build/components/table/Table.vue"),
    "utf8",
  );
  const theme = new Function(
    "tv",
    "EYEBROW_CLASS",
    "REORDER_HANDLE_CLASS",
    `${tableSource.slice(
      tableSource.indexOf("const PANEL_MATCH_BG"),
      tableSource.indexOf("// Grid-like default"),
    )}; return theme;`,
  )(tv, EYEBROW_CLASS, REORDER_HANDLE_CLASS);

  it("tints the open row with the accent and its pinned cells opaquely", () => {
    const ui = theme();
    expect(ui.row({})).toContain("data-[open=true]:bg-primary/10");
    expect(ui.rowCell({ pinned: "left" })).toContain(
      "group-data-[open=true]:bg-[color-mix(in_srgb,var(--ui-primary)_10%,var(--dms-surface-card))]",
    );
  });

  it("draws the accent bar on the open row's first cell", () => {
    expect(theme().row({})).toContain(
      "data-[open=true]:[&>td:first-child]:shadow-[inset_2px_0_0_0_var(--ui-primary)]",
    );
  });
});
