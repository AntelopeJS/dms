/**
 * Every block reading its data through useChartFetch hands it the period
 * scope and the realtime topics of its options: a block that dropped them
 * would silently stop following its PeriodSelector or its topics.
 */
import { type Component, createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { UseChartFetchOptions } from "../layers/dms-ui/app/composables/chart/useChartFetch";

const fetchOptions: Array<UseChartFetchOptions<unknown>> = [];

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: (options: UseChartFetchOptions<unknown>) => {
    fetchOptions.push(options);
    return {
      data: ref(null),
      isLoading: ref(false),
      error: ref(null),
      refresh: async () => {},
    };
  },
}));
vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);
// The frames around the blocks are not under test here.
vi.mock("../layers/dms-ui/app/components/card/Card.vue", () => ({
  default: defineComponent({ setup: () => () => h("div") }),
}));
vi.mock(
  "#dms-layout/app/build/composables/navigation/useCategoryNavCards",
  () => ({
    useCategoryNavCards: () => ({ cards: ref([]) }),
    usePreviewEntryVeil: () => ({}),
  }),
);

const BLOCKS: Record<string, string> = {
  StatGroupBlock: "../layers/dms-ui/app/components/blocks/StatGroupBlock.vue",
  KeyValueListBlock:
    "../layers/dms-ui/app/components/blocks/KeyValueListBlock.vue",
  NavCardGridBlock:
    "../layers/dms-ui/app/components/blocks/NavCardGridBlock.vue",
  ActivityFeed:
    "../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue",
  MeterBlock: "../layers/dms-ui/app/components/meter/MeterBlock.vue",
};
const GLOBAL_COMPONENTS = ["DmsCard", "UIcon", "USkeleton", "UButton", "ULink"];
const SCOPE = "dashboard";
const TOPICS = ["stats:first", "stats:second"];

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function render(block: Component): Promise<void> {
  const app = createSSRApp({
    render: () =>
      h(block, {
        componentId: "block",
        pageId: "page",
        fetchUrl: "/api/data",
        periodScope: SCOPE,
        realtimeTopic: TOPICS,
      }),
  });
  for (const name of GLOBAL_COMPONENTS) app.component(name, Slot);
  await renderToString(app);
}

beforeEach(() => {
  fetchOptions.length = 0;
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useDmsCookie", () => ref<string[]>([]));
});

afterEach(() => vi.unstubAllGlobals());

it.each(Object.keys(BLOCKS))(
  "%s forwards periodScope and realtimeTopic",
  async (name) => {
    const block = (await import(BLOCKS[name])).default as Component;
    await render(block);
    expect(fetchOptions).toHaveLength(1);
    expect(fetchOptions[0]).toMatchObject({
      fetchUrl: "/api/data",
      periodScope: SCOPE,
      realtimeTopic: TOPICS,
    });
  },
);
