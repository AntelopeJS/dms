// @vitest-environment jsdom
/**
 * `fit` draws a horizontal pill list as wide as its tabs: the list stops
 * taking the column's width and the triggers stop growing to share it. A
 * link list, a vertical one and a list without `fit` keep their classes.
 */
import * as vue from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxeOrientation } from "../layers/dms-core/app/types/orientation";
import { Color } from "../layers/dms-core/app/types/color";
import { Size } from "../layers/dms-core/app/types/size";
import { TabVariant } from "../layers/dms-ui/app/composables/tab/types/props";

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({ data: vue.ref(null) }),
}));

interface TabsUi {
  list?: unknown;
  trigger?: unknown;
}

let received: TabsUi = {};
let app: vue.App | undefined;

const Tabs = vue.defineComponent({
  props: { ui: { type: Object, default: () => ({}) } },
  setup: (props) => () => {
    received = props.ui as TabsUi;
    return vue.h("div");
  },
});

const classesOf = (value: unknown): string =>
  [value].flat(Infinity).filter(Boolean).join(" ");

async function mount(props: Record<string, unknown>): Promise<TabsUi> {
  const { default: Tab } = await import(
    "../layers/dms-ui/app/components/tab/Tab.vue"
  );
  app = vue.createApp({
    render: () =>
      vue.h(Tab, {
        items: [
          { label: "Activity", slot: "activity" },
          { label: "Logins", slot: "logins" },
        ],
        componentId: "tabs",
        pageId: "dashboard",
        ...props,
      }),
  });
  app.component("UTabs", Tabs);
  app.mount(document.createElement("div"));
  await vue.nextTick();
  return received;
}

beforeEach(() => {
  for (const name of ["computed", "ref", "useTemplateRef"] as const) {
    vi.stubGlobal(name, vue[name]);
  }
  vi.stubGlobal("AxeOrientation", AxeOrientation);
  vi.stubGlobal("Color", Color);
  vi.stubGlobal("Size", Size);
  vi.stubGlobal("useI18n", () => ({ locale: vue.ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useWatch", () => ({ state: vue.ref({}) }));
  vi.stubGlobal("useTab", () => ({ activeTab: vue.ref("0") }));
  vi.stubGlobal("useTabShortcuts", () => {});
});

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

describe("Tab fit", () => {
  it("hugs a horizontal pill list to its tabs", async () => {
    const ui = await mount({ fit: true });
    expect(classesOf(ui.list)).toContain("w-fit");
    expect(classesOf(ui.trigger)).toContain("grow-0");
  });

  it("keeps the full width by default", async () => {
    const ui = await mount({});
    expect(classesOf(ui.list)).not.toContain("w-fit");
    expect(classesOf(ui.trigger)).toBe("");
  });

  it.each([
    { variant: TabVariant.link },
    { orientation: AxeOrientation.vertical },
  ])("leaves %o as it was", async (props) => {
    const ui = await mount({ fit: true, ...props });
    expect(classesOf(ui.list)).not.toContain("w-fit");
    expect(classesOf(ui.trigger)).toBe("");
  });
});
