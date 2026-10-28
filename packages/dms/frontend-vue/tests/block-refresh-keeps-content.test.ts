/** @vitest-environment jsdom */
/**
 * A data block refreshed (a page refresh, a realtime event, a period change,
 * live resuming) keeps what it shows until the new answer lands: it draws its
 * skeleton only before its first answer. Each block is rendered with a read
 * in flight, once with an answer already on screen (no skeleton) and once
 * without one (its skeleton).
 */
import { createApp, defineComponent, h, nextTick, type Component } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installBlockNetwork,
  provideBlockRuntime,
  registerBlockUi,
} from "./helpers/block-network-runtime";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import { useChartFetch } from "../layers/dms-ui/app/composables/chart/useChartFetch";

const pending: Array<(answer: unknown) => void> = [];
const mounted: Array<{ unmount: () => void }> = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

const { default: KpiCard } = await import(
  "../layers/dms-ui/app/components/kpi/KpiCard.vue"
);
const { default: TopListCard } = await import(
  "../layers/dms-ui/app/components/top-list/TopListCard.vue"
);
const { default: MeterBlock } = await import(
  "../layers/dms-ui/app/components/meter/MeterBlock.vue"
);
const { default: CodeBlock } = await import(
  "../layers/dms-ui/app/components/blocks/CodeBlock.vue"
);
const { default: StatGroupBlock } = await import(
  "../layers/dms-ui/app/components/blocks/StatGroupBlock.vue"
);
const { default: KeyValueListBlock } = await import(
  "../layers/dms-ui/app/components/blocks/KeyValueListBlock.vue"
);
const { default: NavCardGridBlock } = await import(
  "../layers/dms-ui/app/components/blocks/NavCardGridBlock.vue"
);
const { default: ActivityFeed } = await import(
  "../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue"
);
const { default: BannerBlock } = await import(
  "../layers/dms-ui/app/components/blocks/BannerBlock.vue"
);

const SKELETON_MARK = "data-test-skeleton";

interface BlockCase {
  name: string;
  component: Component;
  answer: unknown;
  /** What the answer draws, to check it is on screen. */
  shows: string;
  /** Whether the block draws a skeleton before its first answer. */
  hasSkeleton?: boolean;
}

const ITEMS_TEXT = "Pending orders";

const BLOCKS: BlockCase[] = [
  {
    name: "KpiCard",
    component: KpiCard,
    answer: { value: 4321 },
    shows: "4.3K",
  },
  {
    name: "TopListCard",
    component: TopListCard,
    answer: { items: [{ id: 1, title: ITEMS_TEXT, value: 12 }] },
    shows: ITEMS_TEXT,
  },
  {
    name: "Meter",
    component: MeterBlock,
    answer: { value: 40, max: 100, legend: ITEMS_TEXT },
    shows: "40",
  },
  {
    name: "CodeBlock",
    component: CodeBlock,
    answer: { code: "const answer = 42;" },
    shows: "answer",
  },
  {
    name: "StatGroup",
    component: StatGroupBlock,
    answer: { items: [{ eyebrow: ITEMS_TEXT, value: "12" }] },
    shows: ITEMS_TEXT,
  },
  {
    name: "KeyValueList",
    component: KeyValueListBlock,
    answer: { items: [{ label: ITEMS_TEXT, value: "12" }] },
    shows: ITEMS_TEXT,
  },
  {
    name: "NavCardGrid",
    component: NavCardGridBlock,
    answer: {
      items: [{ title: ITEMS_TEXT, icon: "i-ph-package", to: "/orders" }],
    },
    shows: ITEMS_TEXT,
  },
  {
    name: "ActivityFeed",
    component: ActivityFeed,
    answer: {
      items: [{ id: "1", title: ITEMS_TEXT, at: "2026-10-01T10:00:00Z" }],
    },
    shows: ITEMS_TEXT,
  },
  {
    name: "Banner",
    component: BannerBlock,
    answer: { title: ITEMS_TEXT },
    shows: ITEMS_TEXT,
    hasSkeleton: false,
  },
];

async function mount(block: BlockCase) {
  const app = createApp({
    render: () =>
      h(block.component, {
        componentId: "block",
        pageId: "orders",
        title: "Orders",
        fetchUrl: "/api/orders/block",
      }),
  });
  await provideBlockRuntime(app);
  registerBlockUi(app);
  const root = document.createElement("div");
  app.mount(root);
  mounted.push(app);
  return root;
}

beforeEach(async () => {
  pending.length = 0;
  await installBlockNetwork(
    () => new Promise((resolve) => pending.push(resolve)),
  );
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllGlobals();
});

describe.each(BLOCKS)("$name refreshed", (block) => {
  it("keeps its answer on screen while the new one is on its way", async () => {
    const root = await mount(block);
    await nextTick();
    expect(pending).toHaveLength(1);
    pending[0](block.answer);
    await settle();
    expect(root.textContent).toContain(block.shows);
    const refreshing = refreshPageBlocks();
    await settle();
    expect(pending).toHaveLength(2);
    expect(root.innerHTML).not.toContain(SKELETON_MARK);
    expect(root.textContent).toContain(block.shows);
    pending[1](block.answer);
    await refreshing;
    await nextTick();
    expect(root.textContent).toContain(block.shows);
  });

  it.skipIf(block.hasSkeleton === false)(
    "draws its skeleton before its first answer",
    async () => {
      const root = await mount(block);
      await nextTick();
      expect(pending).toHaveLength(1);
      expect(root.innerHTML).toContain(SKELETON_MARK);
    },
  );
});

it("keeps the newest refresh when an older response arrives last", async () => {
  const root = document.createElement("div");
  const app = createApp(
    defineComponent({
      setup() {
        const { data } = useChartFetch<{ value: string }>({
          fetchUrl: "/api/race",
        });
        return () => h("span", data.value?.value);
      },
    }),
  );
  await provideBlockRuntime(app);
  app.mount(root);
  mounted.push(app);
  await nextTick();
  pending[0]({ value: "initial" });
  await settle();
  const first = refreshPageBlocks();
  await settle();
  const second = refreshPageBlocks();
  await settle();
  expect(pending).toHaveLength(3);
  expect(root.textContent).toBe("initial");
  pending[2]({ value: "newest" });
  await Promise.all([first, second]);
  await nextTick();
  expect(root.textContent).toBe("newest");
  pending[1]({ value: "stale" });
  await settle();
  expect(root.textContent).toBe("newest");
});
