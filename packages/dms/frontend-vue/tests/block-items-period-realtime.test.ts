// @vitest-environment jsdom
/**
 * A list block reading its items from a route follows a PeriodSelector like
 * a KPI card (the period goes with every request, and a new period reads the
 * route again) and reads the route again on each event of its realtime
 * topics, keeping its items on screen until the answer lands.
 */
import { createApp, defineComponent, h, nextTick, reactive, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RealtimeTopicHandler } from "../layers/dms-core/app/composables/realtime/useUserRealtime";

const requests: string[] = [];
let revision = 1;
const topicHandlers = new Map<string, RealtimeTopicHandler>();

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return { items: [{ revision }] };
  },
}));
vi.stubGlobal("useDmsRoute", () => reactive({ query: {} }));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);
vi.mock("../layers/dms-core/app/composables/realtime/useRealtimeTopic", () => ({
  useRealtimeTopic: (topic: string, handler: RealtimeTopicHandler) => {
    topicHandlers.set(topic, handler);
  },
}));

const { usePeriod } = await import(
  "../layers/dms-core/app/composables/period/usePeriod"
);
const { registerPeriodScope } = await import(
  "../layers/dms-core/app/composables/period/usePeriodScope"
);
const { useBlockItems } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useBlockItems"
);

const SCOPE = "block-items-period";
const STATS_URL = "/api/stats";
const FACTS_TOPICS = ["facts:first", "facts:second"];
// useChartFetch debounces every refresh past the first by 180ms.
const SETTLE_MS = 250;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

interface ItemsProbe {
  items?: { value: unknown[] };
  isPending?: { value: boolean };
}

interface SelectedPeriod {
  period?: ReturnType<typeof usePeriod>;
}

const mounted: Array<{ unmount: () => void }> = [];

function mountPeriodPage() {
  const selected: SelectedPeriod = {};
  const Selector = defineComponent({
    setup() {
      const period = usePeriod({ defaultPreset: "last-7-days" });
      registerPeriodScope(SCOPE, period.state);
      selected.period = period;
      return () => h("div");
    },
  });
  const Block = defineComponent({
    setup() {
      useBlockItems({
        items: () => [],
        fetchUrl: STATS_URL,
        periodScope: SCOPE,
      });
      return () => h("div");
    },
  });
  const app = createApp({ render: () => h("main", [h(Selector), h(Block)]) });
  app.mount(document.createElement("div"));
  mounted.push(app);
  return selected;
}

function mountRealtimeBlock(probe: ItemsProbe) {
  const Block = defineComponent({
    setup() {
      const { items, isPending } = useBlockItems({
        items: () => [],
        fetchUrl: STATS_URL,
        realtimeTopic: FACTS_TOPICS,
      });
      probe.items = items;
      probe.isPending = isPending;
      return () => h("div");
    },
  });
  const app = createApp(Block);
  app.mount(document.createElement("div"));
  mounted.push(app);
}

beforeEach(() => {
  requests.length = 0;
  revision = 1;
  topicHandlers.clear();
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

it("requests the items with the period of its scope, again when it changes", async () => {
  const selected = mountPeriodPage();
  await settle();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatch(/^\/api\/stats\?from=.*&preset=last-7-days/);

  selected.period?.setPreset("last-30-days");
  await nextTick();
  await settle();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toContain("preset=last-30-days");
});

it("reads the route again on each event of any of its topics", async () => {
  const probe: ItemsProbe = {};
  mountRealtimeBlock(probe);
  await settle();
  expect([...topicHandlers.keys()]).toEqual(FACTS_TOPICS);
  expect(probe.items?.value).toEqual([{ revision: 1 }]);

  revision = 2;
  topicHandlers.get("facts:second")?.({ type: "facts.update" } as never);
  expect(probe.isPending?.value).toBe(false);
  expect(probe.items?.value).toEqual([{ revision: 1 }]);
  await settle();

  expect(requests).toEqual([STATS_URL, STATS_URL]);
  expect(probe.items?.value).toEqual([{ revision: 2 }]);
});
