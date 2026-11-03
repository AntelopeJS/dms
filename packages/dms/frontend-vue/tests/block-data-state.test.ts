/** @vitest-environment jsdom */
/**
 * A data block states what its reader sees on its root element, for the
 * assistant overlay and test harnesses to read: `loading` before the first
 * answer, `ok` with content, `empty` when the answer holds nothing to draw,
 * `error` when the read failed. A block placed by a page also names its layout
 * path.
 */
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installBlockNetwork,
  provideBlockRuntime,
  registerBlockUi,
  Slot,
} from "./helpers/block-network-runtime";
import { BLOCK_PATH_KEY } from "../layers/dms-ui/app/entries/composables/blocks/blockDataState";

const { default: Chart } = await import(
  "../layers/dms-ui/app/components/chart/Chart.vue"
);
const { default: ChartCard } = await import(
  "../layers/dms-ui/app/components/chart/ChartCard.vue"
);
const { default: KpiCard } = await import(
  "../layers/dms-ui/app/components/kpi/KpiCard.vue"
);
const { default: TopListCard } = await import(
  "../layers/dms-ui/app/components/top-list/TopListCard.vue"
);

const STATE = "data-dms-block-state";
const mounted: Array<{ unmount: () => void }> = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

let answer: () => Promise<unknown>;

interface BlockCase {
  name: string;
  type: string;
  component: Component;
  props?: Record<string, unknown>;
  ok: unknown;
  empty: unknown[];
}

const POINTS = [{ name: "Revenue", data: [{ x: "Jan", y: 12 }] }];

const BLOCKS: BlockCase[] = [
  {
    name: "Chart",
    type: "Chart",
    component: Chart,
    props: { type: "line" },
    ok: { series: POINTS },
    empty: [
      { series: [] },
      { series: [{ name: "Revenue", data: [] }] },
      { series: [{ name: "Revenue", data: [{ x: "Jan", y: null }, 0 / 0] }] },
    ],
  },
  {
    name: "ChartCard",
    type: "ChartCard",
    component: ChartCard,
    ok: { value: 12, series: POINTS },
    empty: [{ series: [] }, { series: [{ name: "Revenue", data: [] }] }],
  },
  {
    name: "KpiCard",
    type: "KpiCard",
    component: KpiCard,
    ok: { value: 12 },
    empty: [{}],
  },
  {
    name: "TopListCard",
    type: "TopListCard",
    component: TopListCard,
    ok: { items: [{ id: 1, title: "Paris", value: 12 }] },
    empty: [{ items: [] }],
  },
];

async function mount(block: BlockCase, path?: string) {
  const Page = defineComponent({
    setup() {
      if (path) provide(BLOCK_PATH_KEY, ref(path));
      return () =>
        h(block.component, {
          componentId: "block",
          pageId: "sales",
          title: "Revenue",
          fetchUrl: "/api/sales/block",
          ...block.props,
        });
    },
  });
  const app = createApp(Page);
  await provideBlockRuntime(app);
  registerBlockUi(app);
  app.component("DmsClientOnly", Slot);
  app.component("DmsApexChartHost", Slot);
  const root = document.createElement("div");
  app.mount(root);
  mounted.push(app);
  return root;
}

function blockOf(root: HTMLElement): Element | null {
  return root.querySelector(`[${STATE}]`);
}

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await installBlockNetwork(() => answer());
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.each(BLOCKS)("$name", (block) => {
  it("is loading before its first answer", async () => {
    answer = () => new Promise(() => {});
    const root = await mount(block);
    await nextTick();
    expect(blockOf(root)?.getAttribute(STATE)).toBe("loading");
  });

  it("is ok once its answer holds something to draw", async () => {
    answer = async () => block.ok;
    const root = await mount(block);
    await settle();
    expect(blockOf(root)?.getAttribute(STATE)).toBe("ok");
  });

  it.each(block.empty)("is empty when its answer is %j", async (response) => {
    answer = async () => response;
    const root = await mount(block);
    await settle();
    expect(blockOf(root)?.getAttribute(STATE)).toBe("empty");
  });

  it("is an error when its read failed", async () => {
    answer = async () => {
      throw new Error("500");
    };
    const root = await mount(block);
    await settle();
    expect(blockOf(root)?.getAttribute(STATE)).toBe("error");
  });

  it("names its kind and the layout path its page gave it", async () => {
    answer = async () => block.ok;
    const root = await mount(block, "revenue.chart");
    await settle();
    const element = blockOf(root);
    expect(element?.getAttribute("data-dms-block-type")).toBe(block.type);
    expect(element?.getAttribute("data-dms-block")).toBe("revenue.chart");
  });
});
