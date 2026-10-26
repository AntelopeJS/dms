import { createApp, defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/entries/composables/actions/useActionTargets";
import type { CustomRowAction } from "../layers/dms-ui/app/types/row-action";
import type {
  DrawerOptions,
  DrawerPatch,
} from "../layers/dms-ui/app/composables/containers/types";
import type { RowNavigation } from "../layers/dms-ui/app/types/row-navigation";
import type { ShowRow } from "../layers/dms-ui/app/entries/composables/actions/rowNavigation";
import type { BulkSelection } from "../layers/dms-ui/app/entries/composables/actions/bulkSelection";
import type { resolveComponentChildren } from "../layers/dms-ui/app/utils/componentTree";

interface DrawerBody {
  rowData?: Parameters<ShowRow>[0];
  selection?: BulkSelection;
  navigation?: RowNavigation;
  showRow?: ShowRow;
  fetchUrl?: string;
  submitUrl?: string;
  fetchRowUrl?: string;
  rowActions?: { custom?: CustomRowAction[] };
  title?: string;
  targetTree?: {
    componentName: string;
    children: ReturnType<typeof resolveComponentChildren>;
  };
}

function drawerBody(options: DrawerOptions["componentOptions"]): DrawerBody {
  // SAFETY: useActionTargets creates these body props for the specific drawer actions exercised below; ContainerOptions erases their component-specific type.
  return options as DrawerBody;
}

let app: App | undefined;

const api = vi.fn(
  async (
    _url: string,
    _options?: { method: string },
  ): Promise<{ count?: number } | number> => ({}),
);

const toasts: Array<{ title?: string }> = [];

const drawers: Array<{
  options: DrawerOptions;
  patches: DrawerPatch[];
  settle: () => void;
}> = [];

const mountTargets = (
  config: Partial<Parameters<typeof useActionTargets>[0]> = {},
) => {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          // SAFETY: These actions only invoke the callable fetch surface; the mock records URL/options and supplies every response used below.
          api: api as Parameters<typeof useActionTargets>[0]["api"],
          pageId: "runs-page",
          componentId: "runs",
          handleApiError: vi.fn(),
          ...config,
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return targets!;
};

beforeEach(() => {
  api.mockClear();
  toasts.length = 0;
  drawers.length = 0;
  vi.stubGlobal("Color", { success: "success" });
  vi.stubGlobal("HttpMethod", { post: "POST" });
  vi.stubGlobal("useToast", () => ({
    add: (toast: never) => toasts.push(toast),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
    processApiMessage: (text: string) => text,
  }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params: { count: number }, plural?: number) =>
      `${key}(${String(params.count)}|${String(plural)})`,
  }));
  vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
  vi.stubGlobal("useDrawer", () => ({
    open: (options: DrawerOptions) => {
      let settle!: () => void;
      const result = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const drawer: (typeof drawers)[number] = {
        options,
        patches: [],
        settle,
      };
      drawers.push(drawer);
      return {
        result,
        close: () => settle(),
        patch: (patch: DrawerPatch) => drawer.patches.push(patch),
      };
    },
  }));
  vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("interpolateUrl", (url: string) => url);
  vi.stubGlobal("resolveDmsComponent", () =>
    defineComponent({ render: () => null }),
  );
  vi.stubGlobal("markRaw", <T>(value: T) => value);
  vi.stubGlobal("ref", ref);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

export { drawerBody, api, toasts, drawers, mountTargets };
