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
  type Ref,
} from "vue";
import { afterEach, beforeEach, vi } from "vitest";
import SidePanelHost from "../layers/dms-layout/app/build/components/layout/SidePanelHost.vue";
import RowSidePanel from "../layers/dms-layout/app/build/components/layout/RowSidePanel.vue";
import RecursiveComponent from "../layers/dms-ui/app/components/RecursiveComponent.vue";
import {
  readSidePanelPreferences,
  SIDE_PANEL_COOKIE,
} from "../layers/dms-layout/app/build/composables/layout/sidePanelState";
import { closeRowSidePanel } from "../layers/dms-layout/app/build/composables/layout/rowSidePanel";
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
let panelMounts: number;
let refreshes: number;

function useDmsState<T>(key: string, init?: () => T): Ref<T> {
  if (!sharedState.has(key)) sharedState.set(key, ref(init?.()));
  // SAFETY: Each state key is initialized and subsequently consumed with the same composable-owned type.
  return sharedState.get(key) as Ref<T>;
}

function useDmsCookie<T>(
  name: string,
  options: { default?: () => T } = {},
): Ref<T> {
  if (!cookies.has(name)) cookies.set(name, ref(options.default?.() ?? null));
  // SAFETY: Each cookie name is read with the same owner type; null is the unset cookie value handled by its parser.
  return cookies.get(name) as Ref<T>;
}

const openPanelId = () =>
  readSidePanelPreferences(cookies.get(SIDE_PANEL_COOKIE)?.value).openId;

const RunPanel = defineComponent({
  props: {
    rowData: { type: Object, default: undefined },
    onSuccessCallback: {
      type: Function,
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
  const runtime = {
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
      locale: ref("fr-FR"),
      t: (key: string, params?: { index?: number; total?: number }) =>
        params ? `${key}(${params.index}/${params.total})` : key,
    }),
    useTranslation: () => ({
      processI18n: (
        value: string,
        params?: { index?: number; total?: number },
      ) => (params ? `${value}(${params.index}/${params.total})` : value),
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
  target: Partial<
    Extract<CustomRowAction["target"], { type: "sidePanel" | "drawer" }>
  > = {},
  action: Partial<CustomRowAction> = {},
): CustomRowAction => ({
  label: "Request",
  isDefault: true,
  target: {
    type: "sidePanel",
    component: { componentName: PANEL_COMPONENT },
    title: "Request details",
    ...target,
  },
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
        // SAFETY: Side-panel targets use no API transport or $fetch helper members in this mounted fixture.
        api: vi.fn() as Parameters<typeof useActionTargets>[0]["api"],
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

export {
  type Row,
  panelMounts,
  refreshes,
  useDmsCookie,
  openPanelId,
  rows,
  panelAction,
  mountPanel,
  settle,
  query,
  title,
  position,
  shownName,
  press,
};
