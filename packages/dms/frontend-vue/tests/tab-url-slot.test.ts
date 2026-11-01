/** @vitest-environment jsdom */
/**
 * A tab set keeping its open tab in the URL writes the tab's slot
 * (`?tab=tester`), which stays right when tabs are added or reordered, and
 * still opens a tab named by its index (`?tab=2`). A tab's badge is a
 * BlockText: an i18n key is written in the reader's language.
 */
import * as vue from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTab } from "../layers/dms-ui/app/composables/tab/useTab";
import { TabEvents } from "../layers/dms-ui/app/composables/tab/types/events";
import type { TabProps } from "../layers/dms-ui/app/composables/tab/types";
import { AxeOrientation } from "../layers/dms-core/app/types/orientation";
import { Color } from "../layers/dms-core/app/types/color";
import { Size } from "../layers/dms-core/app/types/size";
import { isNumber, isString } from "../layers/dms-core/app/utils/type-check";

const ITEMS = [
  { label: "Statistics", slot: "statistics" },
  { label: "Documentation", slot: "documentation" },
  { label: "Tester", slot: "tester" },
];

let route: { query: Record<string, string> };
const push = vi.fn(async (to: { query: Record<string, string> }) => {
  route.query = to.query;
});

function tabsAt(query: Record<string, string>) {
  route.query = query;
  return useTab(ITEMS.length, {
    items: ITEMS,
    persistState: true,
  } satisfies TabProps);
}

beforeEach(() => {
  route = vue.reactive({ query: {} });
  push.mockClear();
  for (const [name, value] of Object.entries({
    computed: vue.computed,
    ref: vue.ref,
    watch: vue.watch,
    useTemplateRef: vue.useTemplateRef,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("TabEvents", TabEvents);
  vi.stubGlobal("isNumber", isNumber);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
  vi.stubGlobal("useWatch", () => ({
    isLoading: vue.ref(false),
    state: vue.ref({}),
  }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsRouter", () => ({ push }));
});

afterEach(() => vi.unstubAllGlobals());

describe("a tab in the URL", () => {
  it("opens the tab its slot names", () => {
    expect(tabsAt({ tab: "tester" }).activeTab.value).toBe("2");
  });

  it("still opens a tab named by its index", () => {
    expect(tabsAt({ tab: "1" }).activeTab.value).toBe("1");
  });

  it("opens the first tab on a name it does not know", () => {
    expect(tabsAt({ tab: "settings" }).activeTab.value).toBe("0");
    expect(tabsAt({ tab: "7" }).activeTab.value).toBe("0");
  });

  it("writes the open tab's slot, and nothing for the first", async () => {
    const { goToTab } = tabsAt({});
    goToTab(2);
    await vue.nextTick();
    expect(push).toHaveBeenLastCalledWith({ query: { tab: "tester" } });
    goToTab("statistics");
    await vue.nextTick();
    expect(push).toHaveBeenLastCalledWith({ query: {} });
  });

  it("follows a URL naming another slot", async () => {
    const { activeTab } = tabsAt({});
    route.query = { tab: "documentation" };
    await vue.nextTick();
    expect(activeTab.value).toBe("1");
  });
});

describe("a tab's badge", () => {
  interface TabsItem {
    badge?: unknown;
  }
  let received: TabsItem[] = [];
  let app: vue.App | undefined;

  const Tabs = vue.defineComponent({
    props: {
      items: {
        // SAFETY: Tab passes its normalized items array to this UTabs replacement.
        type: Array as vue.PropType<TabsItem[]>,
        default: () => [],
      },
    },
    setup: (props) => () => {
      received = props.items;
      return vue.h("div");
    },
  });

  async function badgesOf(badges: unknown[]): Promise<unknown[]> {
    vi.stubGlobal("AxeOrientation", AxeOrientation);
    vi.stubGlobal("Color", Color);
    vi.stubGlobal("Size", Size);
    vi.stubGlobal("useI18n", () => ({
      locale: vue.ref("en"),
      t: (key: string) => `t(${key})`,
    }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
    vi.stubGlobal("useTab", () => ({ activeTab: vue.ref("0") }));
    vi.stubGlobal("useTabShortcuts", () => {});
    const { default: Tab } = await import(
      "../layers/dms-ui/app/components/tab/Tab.vue"
    );
    app = vue.createApp({
      render: () =>
        vue.h(Tab, {
          items: badges.map((badge, index) => ({ ...ITEMS[index], badge })),
        }),
    });
    app.component("UTabs", Tabs);
    app.mount(document.createElement("div"));
    await vue.nextTick();
    app.unmount();
    return received.map((item) => item.badge);
  }

  it("writes an i18n key, a composed text and a badge label in the reader's language", async () => {
    expect(
      await badgesOf([
        "$api.tabs.beta",
        { key: "api.tabs.count" },
        { label: "$api.tabs.new", color: "primary" },
      ]),
    ).toEqual([
      "t(api.tabs.beta)",
      "t(api.tabs.count)",
      { label: "t(api.tabs.new)", color: "primary" },
    ]);
  });

  it("keeps a count and a plain text as they are", async () => {
    expect(await badgesOf([3, "Beta"])).toEqual([3, "Beta"]);
  });
});
