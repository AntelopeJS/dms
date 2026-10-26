/** @vitest-environment jsdom */
/**
 * Every block reading its data through useChartFetch hands it the period
 * scope and the realtime topics of its options: a block that dropped them
 * would silently stop following its PeriodSelector or its topics.
 */
import { type Component, createApp, defineComponent, h, nextTick } from "vue";
import { afterAll, afterEach, beforeEach, expect, it } from "vitest";
import {
  installBlockNetwork,
  browserRuntime,
  provideBlockRuntime,
  registerBlockUi,
  startBlockRealtime,
  stopBlockRealtime,
  publishBlockEvent,
  disposeBlockRealtime,
} from "./helpers/block-network-runtime";
import { usePeriod } from "../layers/dms-core/app/composables/period/usePeriod";
import { registerPeriodScope } from "../layers/dms-core/app/composables/period/usePeriodScope";

const requests: string[] = [];
const mounted: Array<{ unmount: () => void }> = [];
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

const BLOCKS = {
  StatGroupBlock: "../layers/dms-ui/app/components/blocks/StatGroupBlock.vue",
  KeyValueListBlock:
    "../layers/dms-ui/app/components/blocks/KeyValueListBlock.vue",
  NavCardGridBlock:
    "../layers/dms-ui/app/components/blocks/NavCardGridBlock.vue",
  ActivityFeed:
    "../layers/dms-ui/app/components/activity-feed/ActivityFeed.vue",
  MeterBlock: "../layers/dms-ui/app/components/meter/MeterBlock.vue",
  ChartCard: "../layers/dms-ui/app/components/chart/ChartCard.vue",
  TopListCard: "../layers/dms-ui/app/components/top-list/TopListCard.vue",
  KpiCard: "../layers/dms-ui/app/components/kpi/KpiCard.vue",
  Guard: "../layers/dms-ui/app/components/guard/Guard.vue",
};
const SCOPE = "dashboard";
const TOPICS = ["stats:first", "stats:second"];

async function mount(block: Component) {
  let selected: ReturnType<typeof usePeriod> | undefined;
  const Selector = defineComponent({
    setup() {
      selected = usePeriod({ defaultPreset: "last-7-days" });
      registerPeriodScope(SCOPE, selected.state);
      return () => h("div");
    },
  });
  const app = createApp({
    render: () =>
      h("main", [
        h(Selector),
        h(block, {
          componentId: "block",
          pageId: "page",
          fetchUrl: "/api/data",
          fetchUrlMethod: "POST",
          periodScope: SCOPE,
          realtimeTopic: TOPICS,
        }),
      ]),
  });
  await provideBlockRuntime(app);
  registerBlockUi(app);
  app.mount(document.createElement("div"));
  mounted.push(app);
  return () => selected?.setPreset("last-30-days");
}

beforeEach(async () => {
  requests.length = 0;
  await installBlockNetwork(
    async (url: string, options: { method: string }) => {
      expect(options.method).toBe("POST");
      requests.push(url);
      return { items: [], value: 1, series: [] };
    },
  );
  browserRuntime();
  await startBlockRealtime();
});

afterAll(disposeBlockRealtime);
afterEach(async () => {
  mounted.splice(0).forEach((app) => app.unmount());
  await stopBlockRealtime();
});

it.each(Object.entries(BLOCKS))(
  "%s forwards periodScope and realtimeTopic",
  async (_name, path) => {
    const block: Component = (await import(path)).default;
    const changePeriod = await mount(block);
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("preset=last-7-days");
    changePeriod();
    await nextTick();
    await settle();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("preset=last-30-days");
    for (const topic of TOPICS) {
      const count = requests.length;
      await publishBlockEvent(topic);
      await settle();
      expect(requests).toHaveLength(count + 1);
      expect(requests.at(-1)).toBe(requests[1]);
    }
  },
);
