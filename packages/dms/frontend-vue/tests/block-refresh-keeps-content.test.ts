/**
 * A data block refreshed (a page refresh, a realtime event, a period change,
 * live resuming) keeps what it shows until the new answer lands: it draws its
 * skeleton only before its first answer. Each block is rendered with a read
 * in flight, once with an answer already on screen (no skeleton) and once
 * without one (its skeleton).
 */
import * as vue from "vue";
import { createSSRApp, defineComponent, h, ref, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";

// What the block's read holds: the answer on screen, and a read in flight.
let onScreen: unknown = null;

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: () => ({
    data: ref(onScreen),
    isLoading: ref(true),
    error: ref(null),
    refresh: async () => {},
  }),
}));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);

vi.mock(
  "../layers/dms-ui/app/build/composables/actions/useActionTargets",
  () => ({
    useActionTargets: () => ({ handleCustomButton: () => {} }),
  }),
);

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

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});
const Skeleton = defineComponent({
  render: () => h("span", { [SKELETON_MARK]: "" }),
});

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
  { name: "KpiCard", component: KpiCard, answer: { value: 4321 }, shows: "4" },
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
    // Draws nothing, not a skeleton, before its first answer.
    name: "Banner",
    component: BannerBlock,
    answer: { title: ITEMS_TEXT },
    shows: ITEMS_TEXT,
    hasSkeleton: false,
  },
];

async function render(block: BlockCase, answer: unknown): Promise<string> {
  onScreen = answer;
  const app = createSSRApp({
    render: () =>
      h(block.component, {
        componentId: "block",
        pageId: "orders",
        title: "Orders",
        fetchUrl: "/api/orders/block",
      }),
  });
  for (const name of [
    "DmsCard",
    "UCard",
    "UBadge",
    "UIcon",
    "UButton",
    "UAlert",
    "UTooltip",
    "ULink",
    "UAvatar",
    "NuxtLink",
    "DmsLink",
  ]) {
    app.component(name, Slot);
  }
  app.component("USkeleton", Skeleton);
  app.config.warnHandler = () => {};
  return renderToString(app);
}

beforeEach(() => useRealDataEngine());

// The Vue auto-imports the components use.
const VUE_GLOBALS = [
  "ref",
  "computed",
  "watch",
  "watchEffect",
  "onMounted",
  "onBeforeUnmount",
  "onUnmounted",
  "nextTick",
  "toRef",
  "shallowRef",
  "inject",
  "provide",
  "useSlots",
] as const;

beforeEach(() => {
  for (const name of VUE_GLOBALS) vi.stubGlobal(name, vue[name]);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: String,
    t: String,
  }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useDefinedFunctions", () => ({
    getFunction: () => undefined,
  }));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: async () => null }));
  vi.stubGlobal("useSiteLayout", () => ({ layout: ref(null) }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {}, params: {} }));
});

afterEach(() => {
  onScreen = null;
  vi.unstubAllGlobals();
});

describe.each(BLOCKS)("$name refreshed", (block) => {
  it("keeps its answer on screen while the new one is on its way", async () => {
    const html = await render(block, block.answer);
    expect(html).not.toContain(SKELETON_MARK);
    expect(html).toContain(block.shows);
  });

  it.skipIf(block.hasSkeleton === false)(
    "draws its skeleton before its first answer",
    async () => {
      expect(await render(block, null)).toContain(SKELETON_MARK);
    },
  );
});
