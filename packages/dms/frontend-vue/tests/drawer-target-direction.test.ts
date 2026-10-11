// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  reactive,
  ref,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useActionTargets } from "../layers/dms-ui/app/build/composables/actions/useActionTargets";
import type { ActionTarget } from "../layers/dms-ui/app/composables/table-view/types/action-target";

vi.mock("reka-ui", () => {
  const passThrough = defineComponent({
    setup: (_props, { slots }) => () => h("div", slots.default?.()),
  });
  return {
    DialogTitle: passThrough,
    DialogDescription: passThrough,
    VisuallyHidden: passThrough,
  };
});

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

describe("a drawer action target's direction", () => {
  const opened: Array<Record<string, unknown>> = [];

  const mountTargets = () => {
    let targets: ReturnType<typeof useActionTargets> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          targets = useActionTargets({
            api: vi.fn() as never,
            pageId: "page",
            componentId: "table",
            handleApiError: vi.fn(),
          });
          return () => h("div");
        },
      }),
    );
    app.mount(host);
    return targets!;
  };

  const drawerTarget = (
    direction?: "right" | "left" | "top" | "bottom",
  ): ActionTarget => ({
    type: "drawer",
    component: { componentName: "Inspector" },
    ...(direction && { direction }),
  });

  beforeEach(() => {
    opened.length = 0;
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) => text,
      processApiMessage: (text: string) => text,
    }));
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useModal", () => ({ open: vi.fn() }));
    vi.stubGlobal("useDrawer", () => ({
      open: (options: Record<string, unknown>) => {
        opened.push(options);
        return {
          result: new Promise(() => {}),
          close: vi.fn(),
          patch: vi.fn(),
        };
      },
    }));
    vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
    vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
    vi.stubGlobal("resolveDmsComponent", () =>
      defineComponent({ render: () => null }),
    );
  });

  it("opens a toolbar or header button's drawer from the edge it names", async () => {
    const targets = mountTargets();
    targets.handleCustomButton({
      label: "Inspect",
      target: drawerTarget("right"),
    });
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]!.direction).toBe("right");
  });

  it("opens a row action's drawer from the edge it names", async () => {
    const targets = mountTargets();
    targets.handleCustomRowAction(
      { label: "Inspect", target: drawerTarget("left") },
      { _id: "r1" },
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]!.direction).toBe("left");
  });

  it("leaves the direction to the drawer when the target names none", async () => {
    const targets = mountTargets();
    targets.handleCustomButton({ label: "Inspect", target: drawerTarget() });
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0]!.direction).toBe(undefined);
  });
});

describe("the drawer container", () => {
  interface DrawerStubProps {
    direction?: string;
    ui?: Record<string, string>;
  }

  const rendered = reactive<DrawerStubProps>({});

  const mountDrawer = async (props: Record<string, unknown>) => {
    const { default: DynamicDrawer } = await import(
      "../layers/dms-ui/app/build/components/containers/drawer/DynamicDrawer.vue"
    );
    app = createApp({
      setup: () => () =>
        h(DynamicDrawer, {
          title: "Inspector",
          containerId: "drawer-1",
          component: defineComponent({ render: () => null }),
          ...props,
        }),
    });
    app.component(
      "UDrawer",
      defineComponent({
        props: { direction: String, ui: Object },
        setup(stubProps, { slots }) {
          return () => {
            Object.assign(rendered, stubProps);
            return h("div", [slots.header?.(), slots.body?.()]);
          };
        },
      }),
    );
    app.component(
      "UContainer",
      defineComponent({
        setup: (_props, { slots }) => () =>
          h("div", { "data-container": "" }, slots.default?.()),
      }),
    );
    app.component("UButton", () => h("button"));
    app.component("USkeleton", () => h("span"));
    app.mount(host);
    await nextTick();
  };

  beforeEach(() => {
    rendered.direction = undefined;
    rendered.ui = undefined;
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("provide", provide);
    vi.stubGlobal("useLeaveGuard", () => ({
      executeGuards: async () => true,
      clearGuards: vi.fn(),
    }));
    vi.stubGlobal("useDmsRoute", () => reactive({ path: "/" }));
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  });

  it("slides in from the bottom, full width, by default", async () => {
    await mountDrawer({});
    expect(rendered.direction).toBe("bottom");
    expect(rendered.ui?.content).toBe(undefined);
    const containers = host.querySelectorAll("[data-container]");
    expect(containers[0]!.className).toContain("max-sm:px-0");
    expect(containers[0]!.className).not.toContain("lg:px-0");
  });

  it("is a side sheet as wide as a side panel from the right", async () => {
    await mountDrawer({ direction: "right" });
    expect(rendered.direction).toBe("right");
    expect(rendered.ui?.content).toBe("w-[440px]");
    const containers = host.querySelectorAll("[data-container]");
    expect(containers[0]!.className).toContain("px-0 sm:px-0 lg:px-0");
  });
});
