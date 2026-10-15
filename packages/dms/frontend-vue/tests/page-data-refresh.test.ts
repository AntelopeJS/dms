// @vitest-environment jsdom
/**
 * A page's `useApiData` reads follow the page: `refreshPageBlocks()` (an
 * action of the user) and an event on one of the page's realtime topics read
 * them again through `refreshDmsPageData()`, without a `refresh()` of their
 * own. A read that refreshes on its own triggers opts out.
 */
import { type App, createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeTopicHandler } from "../layers/dms-core/app/composables/realtime/useUserRealtime";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";

const requests: string[] = [];
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return { url };
  },
}));

const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
const { usePageDataRefresh } = await import(
  "../layers/dms-ui/app/build/composables/live/usePageDataRefresh"
);

// Past the one-frame window a burst of refreshes collapses into.
const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

const pageTopics = ref<string[]>([]);
const handlers = new Map<string, Set<RealtimeTopicHandler>>();
function subscribe(topic: string, handler: RealtimeTopicHandler) {
  if (!handlers.has(topic)) handlers.set(topic, new Set());
  handlers.get(topic)!.add(handler);
  return () => handlers.get(topic)?.delete(handler);
}
function publish(topic: string, event: object): void {
  for (const handler of handlers.get(topic) ?? [])
    handler(event as Parameters<RealtimeTopicHandler>[0]);
}

const mounted: App[] = [];

async function mountPage(): Promise<void> {
  const Page = defineComponent({
    setup() {
      usePageDataRefresh({ pageTopics, subscribe });
      useApiData("/api/orders");
      useApiData("/api/own-triggers", { refreshOnPageRefresh: false });
      return () => h("div");
    },
  });
  const app = createApp(Page);
  app.mount(document.createElement("div"));
  mounted.push(app);
  await settle();
}

beforeEach(() => {
  useRealDataEngine();
  requests.length = 0;
  pageTopics.value = [];
  handlers.clear();
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("the page's data refresh", () => {
  it("reads the page's data again on refreshPageBlocks()", async () => {
    await mountPage();
    expect(requests.sort()).toEqual(["/api/orders", "/api/own-triggers"]);
    requests.length = 0;

    refreshPageBlocks();
    await settle();

    expect(requests).toEqual(["/api/orders"]);
  });

  it("reads it again on an event of one of the page's topics", async () => {
    await mountPage();
    pageTopics.value = ["table:orders"];
    await nextTick();
    requests.length = 0;

    publish("table:orders", { topic: "table:orders", type: "updated" });
    publish("table:orders", { topic: "table:orders", type: "updated" });
    await settle();
    expect(requests).toEqual(["/api/orders"]);

    // A presence snapshot rides the topic too, and changes no data.
    requests.length = 0;
    publish("table:orders", { topic: "table:orders", entries: [] });
    await settle();
    expect(requests).toEqual([]);
  });

  it("stops following the topics the page no longer has", async () => {
    await mountPage();
    pageTopics.value = ["table:orders"];
    await nextTick();
    pageTopics.value = ["table:invoices"];
    await nextTick();
    requests.length = 0;

    publish("table:orders", { topic: "table:orders", type: "updated" });
    await settle();
    expect(requests).toEqual([]);
  });
});
