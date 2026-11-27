// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  provide,
  ref,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unusedApi } from "./fixtures/unusedApi";
import { useActionTargets } from "../layers/dms-ui/app/entries/composables/actions/useActionTargets";
import RecursiveComponent from "../layers/dms-ui/app/components/RecursiveComponent.vue";
import { useRealDataEngine } from "./fixtures/dataEngine";
import TargetComponentTree from "../layers/dms-ui/app/entries/components/containers/TargetComponentTree";
import type { ActionTarget } from "../layers/dms-ui/app/composables/table-view/types/action-target";
import type { ModalOptions } from "../layers/dms-ui/app/composables/containers/types";
import type { useDrawer } from "../layers/dms-ui/app/composables/containers/useDrawer";
import { defined } from "./helpers/defined";

const received: Array<Record<string, string> | undefined> = [];

const Block = defineComponent({
  props: { routeParams: Object },
  setup: (props, { slots }) => {
    received.push(props.routeParams);
    return () => h("div", slots.default?.());
  },
});

type OpenedContainer = Pick<ModalOptions, "component" | "componentOptions">;

const opened: OpenedContainer[] = [];
let app: App | undefined;

const mountTargets = () => {
  let targets: ReturnType<typeof useActionTargets> | undefined;
  app = createApp(
    defineComponent({
      setup() {
        targets = useActionTargets({
          api: unusedApi(),
          pageId: "site",
          componentId: "header",
          handleApiError: vi.fn(),
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return defined(targets);
};

const container = () => {
  const instance = {
    result: new Promise(() => {}),
    close: vi.fn(),
    patch: vi.fn(),
  };
  return instance;
};

beforeEach(() => {
  opened.length = 0;
  useRealDataEngine();
  received.length = 0;
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
    processApiMessage: (text: string) => text,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useModal", () => ({
    open: (options: ModalOptions) => {
      opened.push(options);
      return container();
    },
  }));
  vi.stubGlobal("useDrawer", () => ({
    open: (options: Parameters<ReturnType<typeof useDrawer>["open"]>[0]) => {
      opened.push(options);
      return container();
    },
  }));
  vi.stubGlobal("useExportJob", () => ({ runJob: vi.fn() }));
  vi.stubGlobal("useConfirm", () => ({ confirm: vi.fn(async () => true) }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useDmsRoute", () => ({ path: "/sites/s1", query: {} }));
  vi.stubGlobal("findPageRoute", () => ({ params: { id: "s1" } }));
  vi.stubGlobal("markRaw", <T>(value: T) => value);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("provide", provide);
  vi.stubGlobal("resolveDmsComponent", () => Block);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

const target = (
  type: "modal" | "drawer" | "sidePanel",
  children?: boolean,
): ActionTarget => ({
  type,
  component: {
    componentName: "Form",
    options: { fetchUrl: "/api/sites/{{params.id}}" },
    ...(children && {
      children: [
        {
          id: "name",
          component: { componentName: "Input", options: {} },
        },
      ],
    }),
  },
});

describe("the component a header button's container opens", () => {
  it.each(["modal", "drawer"] as const)(
    "receives the route parameters of the page, in a %s",
    async (type) => {
      mountTargets().handleCustomButton({
        label: "Edit",
        target: target(type),
      });
      await vi.waitFor(() => expect(opened).toHaveLength(1));
      expect(defined(opened[0]).componentOptions).toMatchObject({
        routeParams: { id: "s1" },
      });
    },
  );

  it("receives them on a table row action of the page too", async () => {
    mountTargets().handleCustomRowAction(
      { label: "Edit", target: target("drawer") },
      { _id: "r1" },
    );
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(defined(opened[0]).componentOptions).toMatchObject({
      routeParams: { id: "s1" },
    });
  });

  it("hands them on to the blocks drawn inside a container block", async () => {
    mountTargets().handleCustomButton({
      label: "Edit",
      target: target("modal", true),
    });
    await vi.waitFor(() => expect(opened).toHaveLength(1));
    expect(defined(opened[0]).component).toBe(TargetComponentTree);
    const tree: Component = TargetComponentTree;
    const host = createApp({
      render: () => h(tree, defined(opened[0]).componentOptions),
    });
    host.component("DmsRecursiveComponent", RecursiveComponent);
    host.mount(document.createElement("div"));
    expect(received).toEqual([{ id: "s1" }, { id: "s1" }]);
    host.unmount();
  });
});
