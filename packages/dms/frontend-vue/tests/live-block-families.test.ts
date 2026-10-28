/** @vitest-environment jsdom */
/**
 * Pause freezes every block of a live page, family by family: the cards that
 * read a `fetchUrl` (KPI, chart, top list, meter, banner, code, prose), the
 * list blocks (StatGroup, KeyValueList, NavCardGrid, ActivityFeed) and a
 * custom component's `useApiData` polling. Paused — by the user or a hidden
 * tab — none of them requests anything on a realtime event or a live
 * refresh, the page counts what they missed, and resuming reads each one
 * once. The table view and the page's own `useApiData` reads have their own
 * suites (table-live-hold, page-data-refresh), `usePageLiveRefresh` too
 * (page-live-refresh).
 */
import { createApp, defineComponent, h } from "vue";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  installBlockNetwork,
  browserRuntime,
  startBlockRealtime,
  stopBlockRealtime,
  publishBlockEvent,
  disposeBlockRealtime,
  engine,
} from "./helpers/block-network-runtime";
import { refreshLivePageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";

const requests: string[] = [];
vi.stubGlobal("defineDmsPlugin", engine.defineDmsPlugin);

const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);
const { useBlockItems } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useBlockItems"
);
const { useApiData } = await import(
  "../layers/dms-core/app/composables/auth/useApiData"
);

const { default: livePauseSourcePlugin } = await import(
  "../layers/dms-ui/app/plugins/live-pause-source"
);

const TOPIC = "orders:events";
const CARD_URL = "/api/orders/kpi";
const LIST_URL = "/api/orders/stats";
const POLLED_URL = "/api/orders/health";
const POLL_MS = 30;

const SLOW_POLL_MS = 400;

const SETTLE_MS = 250;
const settle = (ms = SETTLE_MS) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const mounted: Array<{ unmount: () => void }> = [];
const controllers: PageLiveController[] = [];

const publish = () => publishBlockEvent(TOPIC);

function installLive(): PageLiveController {
  const controller = createPageLiveController("shop.orders", {});
  controllers.push(controller);
  setCurrentPageLive(controller);
  return controller;
}

function mount(setup: () => void): void {
  const app = createApp(
    defineComponent({
      setup() {
        setup();
        return () => h("div");
      },
    }),
  );
  browserRuntime(app);
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This plugin reads only vueApp; other app-context services are intentionally absent from the polling fixture.
  livePauseSourcePlugin({ vueApp: app } as never);
  app.mount(document.createElement("div"));
  mounted.push(app);
}

/** How many requests went to `url`. */
const sentTo = (url: string) => requests.filter((sent) => sent === url).length;

beforeEach(async () => {
  await installBlockNetwork(async (url: string) => {
    requests.push(url);
    return { items: [], value: requests.length };
  });
  browserRuntime();
  await startBlockRealtime();
  requests.length = 0;
  window.localStorage.clear();
});

afterAll(disposeBlockRealtime);
afterEach(async () => {
  mounted.splice(0).forEach((app) => app.unmount());
  controllers.splice(0).forEach((controller) => controller.dispose());
  setCurrentPageLive(null);
  await stopBlockRealtime();
});

interface BlockFamily {
  name: string;
  url: string;
  mountBlock: (realtimeTopic?: string) => void;
}

const FAMILIES: BlockFamily[] = [
  {
    name: "a card reading a fetchUrl (KPI, chart, top list, meter, banner)",
    url: CARD_URL,
    mountBlock: (realtimeTopic) =>
      mount(() => useChartFetch({ fetchUrl: CARD_URL, realtimeTopic })),
  },
  {
    name: "a list block (StatGroup, KeyValueList, NavCardGrid, ActivityFeed)",
    url: LIST_URL,
    mountBlock: (realtimeTopic) =>
      mount(() =>
        useBlockItems({ items: () => [], fetchUrl: LIST_URL, realtimeTopic }),
      ),
  },
];

describe.each(FAMILIES)("$name on a live page", ({ url, mountBlock }) => {
  it("requests nothing on its events while paused, and reads once on resume", async () => {
    const live = installLive();
    mountBlock(TOPIC);
    await settle();
    expect(sentTo(url)).toBe(1);

    live.pause();
    await publish();
    await publish();
    await settle();
    expect(sentTo(url)).toBe(1);
    expect(live.missedCount.value).toBe(2);

    live.resume();
    await settle();
    expect(sentTo(url)).toBe(2);
    expect(live.missedCount.value).toBe(0);
  });

  it("holds a live refresh while paused, without a realtimeTopic", async () => {
    const live = installLive();
    mountBlock();
    await settle();

    live.pause();
    refreshLivePageBlocks();
    await settle();
    expect(sentTo(url)).toBe(1);

    live.resume();
    await settle();
    expect(sentTo(url)).toBe(2);
  });

  it("requests nothing while the tab is hidden, and reads once on return", async () => {
    const live = installLive();
    mountBlock(TOPIC);
    await settle();

    live.setHidden(true);
    await publish();
    await settle();
    expect(sentTo(url)).toBe(1);

    live.setHidden(false);
    await settle();
    expect(sentTo(url)).toBe(2);
  });

  it("reads on each event while live", async () => {
    installLive();
    mountBlock(TOPIC);
    await settle();

    await publish();
    await settle();
    expect(sentTo(url)).toBe(2);
  });
});

describe("a component polling with refreshInterval on a live page", () => {
  const mountPolled = (refreshInterval = POLL_MS) =>
    mount(() =>
      useApiData(POLLED_URL, {
        refreshInterval,
        refreshOnPageRefresh: false,
      }),
    );

  it("stops polling while paused, and reads once on resume", async () => {
    const live = installLive();
    mountPolled();
    await settle(POLL_MS * 3);
    expect(sentTo(POLLED_URL)).toBeGreaterThan(1);

    live.pause();
    await settle(POLL_MS);
    const atPause = sentTo(POLLED_URL);
    await settle(POLL_MS * 4);
    expect(sentTo(POLLED_URL)).toBe(atPause);

    live.resume();
    await settle(POLL_MS / 3);
    expect(sentTo(POLLED_URL)).toBe(atPause + 1);
  });

  it("does not read on resume when no poll fell due meanwhile", async () => {
    const live = installLive();
    mountPolled(SLOW_POLL_MS);
    await settle(POLL_MS);
    expect(sentTo(POLLED_URL)).toBe(1);

    live.pause();
    await settle(POLL_MS);
    live.resume();
    await settle(POLL_MS);
    expect(sentTo(POLLED_URL)).toBe(1);
  });

  it("keeps polling in an app without a pause source", async () => {
    installLive().pause();
    const app = createApp(
      defineComponent({
        setup() {
          useApiData(POLLED_URL, {
            refreshInterval: POLL_MS,
            refreshOnPageRefresh: false,
          });
          return () => h("div");
        },
      }),
    );
    browserRuntime(app);
    app.mount(document.createElement("div"));
    mounted.push(app);
    await settle(POLL_MS * 4);
    expect(sentTo(POLLED_URL)).toBeGreaterThan(2);
  });

  it("keeps polling on a page without live", async () => {
    mountPolled();
    await settle(POLL_MS * 4);
    expect(sentTo(POLLED_URL)).toBeGreaterThan(2);
  });
});
