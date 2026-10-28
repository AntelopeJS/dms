import {
  computed,
  createApp,
  defineComponent,
  h,
  ref,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import type { RowNavigationSource } from "../layers/dms-ui/app/build/composables/actions/rowNavigation";
import RowHeader from "../layers/dms-ui/app/build/components/containers/row/RowHeader.vue";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import type {
  DrawerOptions,
  DrawerPatch,
} from "../layers/dms-ui/app/composables/containers/types";

const PANEL_COMPONENT = "OrderPanel";

type Row = {
  _id: string;
  name: string;
};

interface OpenedDrawer {
  options: DrawerOptions;
  patches: DrawerPatch[];
  close: () => void;
}

const rows: Row[] = [
  { _id: "r1", name: "First" },
  { _id: "r2", name: "Second" },
  { _id: "r3", name: "Third" },
];

let app: App | undefined;
let opened: OpenedDrawer[];

const Panel = defineComponent({ render: () => null });

function installRuntime(): void {
  const runtime = {
    computed,
    ref,
    markRaw: <T>(value: T) => value,
    Color: { success: "success" },
    HttpMethod: { post: "POST" },
    interpolateUrl: (url: string) => url,
    resolveDmsComponent: (name: string) =>
      name === PANEL_COMPONENT ? Panel : undefined,
    useI18n: () => ({
      locale: ref("fr-FR"),
      t: (key: string, params?: { index?: string; total?: string }) =>
        params ? `${key}(${params.index}/${params.total})` : key,
    }),
    useTranslation: () => ({
      processI18n: (
        value: string,
        params?: { index?: string; total?: string },
      ) => (params ? `${value}(${params.index}/${params.total})` : value),
      processApiMessage: (value: string) => value,
    }),
    useToast: () => ({ add: vi.fn() }),
    useModal: () => ({ open: vi.fn() }),
    useDrawer: () => ({
      open: (options: DrawerOptions) => {
        let settle!: () => void;
        const result = new Promise<void>((resolve) => {
          settle = resolve;
        });
        const drawer: OpenedDrawer = {
          options,
          patches: [],
          close: () => settle(),
        };
        opened.push(drawer);
        return {
          result,
          close: drawer.close,
          patch: (patch: DrawerPatch) => drawer.patches.push(patch),
        };
      },
    }),
    useExportJob: () => ({ runJob: vi.fn() }),
    useConfirm: () => ({ confirm: vi.fn(async () => true) }),
    useAuthFetch: () => ({ $authFetch: vi.fn() }),
  };
  Object.entries(runtime).forEach(([name, value]) =>
    vi.stubGlobal(name, value),
  );
}

const drawerAction = (
  target: Partial<Extract<CustomRowAction["target"], { type: "drawer" }>> = {},
  action: Partial<CustomRowAction> = {},
): CustomRowAction => ({
  label: "Order",
  isDefault: true,
  target: {
    type: "drawer",
    direction: "right",
    component: { componentName: PANEL_COMPONENT },
    title: "Order details",
    ...target,
  },
  ...action,
});

function mountTargets(
  shownRows: Ref<Row[]> = ref(rows),
  paging: Partial<RowNavigationSource> = {},
): ReturnType<typeof useActionTargets> {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          // SAFETY: Drawer-only actions never invoke the API client; this callable sentinel preserves the unused dependency.
          api: vi.fn() as never,
          pageId: "orders-page",
          componentId: "orders",
          handleApiError: vi.fn(),
          rowNavigation: {
            rows: () => shownRows.value,
            rowIdKey: "_id",
            ...paging,
          },
          recordScope: { tableId: "orders", isSoleTableView: true },
        });
        return () => h("table");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return targets!;
}

const latest = (drawer: OpenedDrawer): DrawerOptions =>
  Object.assign({}, drawer.options, ...drawer.patches);
const headerOf = (drawer: OpenedDrawer) =>
  latest(drawer).headerComponentOptions;

const press = (key: string) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));

const openOn = async (action: CustomRowAction, row: Row = rows[0]!) => {
  const targets = mountTargets();
  targets.handleCustomRowAction(action, row);
  await vi.waitFor(() => expect(opened).toHaveLength(1));
  return { targets, drawer: opened[0]! };
};

beforeEach(() => {
  opened = [];
  installRuntime();
  window.history.replaceState(null, "", "/orders");
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

const mountHeader = (props: InstanceType<typeof RowHeader>["$props"]) => {
  const host = document.createElement("div");
  app = createApp({ render: () => h(RowHeader, props) });
  app.component(
    "UButton",
    defineComponent({
      props: { disabled: Boolean },
      emits: ["click"],
      setup:
        (buttonProps, { emit, attrs }) =>
        () =>
          h("button", {
            ...attrs,
            disabled: buttonProps.disabled,
            onClick: () => emit("click"),
          }),
    }),
  );
  app.mount(host);
  return host;
};

export {
  PANEL_COMPONENT,
  type Row,
  type OpenedDrawer,
  app,
  opened,
  drawerAction,
  mountTargets,
  latest,
  headerOf,
  press,
  openOn,
  mountHeader,
};
