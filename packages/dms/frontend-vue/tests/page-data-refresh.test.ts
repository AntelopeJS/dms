/** @vitest-environment jsdom */
/**
 * A page's `useApiData` reads follow the page: `refreshPageBlocks()` (an
 * action of the user) and an event on one of the page's realtime topics read
 * them again through `refreshDmsPageData()`, without a `refresh()` of their
 * own. A read that refreshes on its own triggers opts out. On a page declared
 * with `live`, what nobody asked for waits while the page is paused, and an
 * action of the user reads at once.
 */
import { type App, createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeTopicHandler } from "../layers/dms-core/app/composables/realtime/useUserRealtime";
import { useRealDataEngine } from "./fixtures/dataEngine";
import {
  refreshLivePageBlocks,
  refreshPageBlocks,
} from "../layers/dms-ui/app/utils/blockRefresh";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";

const requests: string[] = [];

let held: Promise<void> | undefined;
vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    await held;
    return { url };
  },
}));

const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);
const { usePageDataRefresh } = await import(
  "../layers/dms-ui/app/build/composables/live/usePageDataRefresh"
);

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
const controllers: PageLiveController[] = [];

/** The controller of a page declared with `live`, as the page renderer installs it. */
function installLive(): PageLiveController {
  const controller = createPageLiveController("shop.orders", {});
  controllers.push(controller);
  setCurrentPageLive(controller);
  return controller;
}

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
  controllers.splice(0).forEach((controller) => controller.dispose());
  setCurrentPageLive(null);
  window.localStorage.clear();
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

  it("resolves refreshPageBlocks() once the page's data is read again", async () => {
    await mountPage();
    requests.length = 0;
    let release!: () => void;
    held = new Promise<void>((resolve) => (release = resolve));
    let done = false;
    const refreshed = refreshPageBlocks().then(() => (done = true));
    await settle();
    expect(requests).toEqual(["/api/orders"]);
    expect(done).toBe(false);

    release();
    held = undefined;
    await refreshed;
    expect(done).toBe(true);
  });

  it("joins the refreshes of one burst", async () => {
    await mountPage();
    requests.length = 0;
    await Promise.all([refreshPageBlocks(), refreshPageBlocks()]);
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

describe("the page's data refresh on a page declared with live", () => {
  it("holds what nobody asked for while paused, and reads it once on resume", async () => {
    const live = installLive();
    await mountPage();
    pageTopics.value = ["table:orders"];
    await nextTick();
    requests.length = 0;

    live.pause();
    publish("table:orders", { topic: "table:orders", type: "updated" });
    publish("table:orders", { topic: "table:orders", type: "updated" });
    refreshLivePageBlocks();
    await settle();
    expect(requests).toEqual([]);

    live.resume();
    await settle();
    expect(requests).toEqual(["/api/orders"]);
  });

  it("reads at once on an action of the user, paused, and forgets what it missed", async () => {
    const live = installLive();
    await mountPage();
    pageTopics.value = ["table:orders"];
    await nextTick();
    requests.length = 0;

    live.pause();
    publish("table:orders", { topic: "table:orders", type: "updated" });
    await settle();
    expect(requests).toEqual([]);

    await refreshPageBlocks();
    expect(requests).toEqual(["/api/orders"]);

    requests.length = 0;
    live.resume();
    await settle();
    expect(requests).toEqual([]);
  });
});
