/** @vitest-environment jsdom */
/**
 * The live mode beyond Live / Pause: what a pause counts (published rows, not
 * messages), the holds a component takes with a reason, the hidden tab, the
 * `?live=0` URL, the shared `rememberKey`, the polling while the stream is down and
 * its slower cadence over a long period, and the remembered pause applied only
 * once the page is mounted.
 */
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { liveShellRuntime } from "./helpers/live-shell-runtime";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import {
  bindPageLiveEnvironment,
  usePageLiveHost,
} from "../layers/dms-ui/app/build/composables/live/usePageLiveHost";
import {
  liveIntervalMs,
  livePeriodMs,
} from "../layers/dms-ui/app/build/composables/live/liveCadence";
import { MissedTally } from "../layers/dms-ui/app/build/composables/live/missedTally";
import { usePageLive } from "../layers/dms-ui/app/composables/live/usePageLive";
import { currentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";

const realtime = liveShellRuntime();

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);

const PAGE = "modules.api.logs";
const TOPIC = "api:monitor:requests";
const ROW_TOPIC = "dms:table:requests";
const DAY_MS = 24 * 60 * 60 * 1000;
const mounted: Array<{ unmount: () => void }> = [];
const controllers: PageLiveController[] = [];

function publish(payload?: Record<string, unknown>, topic = TOPIC) {
  return realtime.publish(topic, payload);
}

function mountBlock(topic: string = TOPIC) {
  const onRefresh = vi.fn();
  const app = createApp(
    defineComponent({
      setup() {
        useRefreshTriggers(topic, onRefresh);
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  mounted.push(app);
  return onRefresh;
}

function install(
  options: Parameters<typeof createPageLiveController>[1] = {},
  start?: Parameters<typeof createPageLiveController>[2],
  pageId = PAGE,
): PageLiveController {
  const controller = createPageLiveController(pageId, options, start);
  controllers.push(controller);
  setCurrentPageLive(controller);
  return controller;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(async () => {
  vi.stubGlobal("isDmsHydrating", () => false);
  vi.useFakeTimers();
  await realtime.start();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  setVisibility("visible");
});

afterEach(async () => {
  mounted.splice(0).forEach((app) => app.unmount());
  controllers.splice(0).forEach((controller) => controller.dispose());
  setCurrentPageLive(null);
  await realtime.stop();
  vi.useRealTimers();
});

describe("the pause counter", () => {
  it("counts the requests a batch announces, not the messages", async () => {
    const live = install({ maxRate: 5 });
    const table = mountBlock();
    mountBlock();
    live.pause();

    await publish({ count: 25, server5xx: 2, tester: 0 });
    await publish({ count: 15, server5xx: 0, tester: 1 });

    expect(live.missedCount.value).toBe(40);
    live.resume();
    expect(table).toHaveBeenCalledTimes(1);
  });

  it("counts each published row once, across messages", async () => {
    const live = install();
    mountBlock(ROW_TOPIC);
    live.pause();

    await publish({ ids: ["a", "b", "c"] }, ROW_TOPIC);
    await publish({ ids: ["b", "d"] }, ROW_TOPIC);

    expect(live.missedCount.value).toBe(4);
  });

  it("counts a message without ids nor count as one", () => {
    const tally = new MissedTally();
    tally.add({ topic: TOPIC, payload: { count: 0 } });
    tally.add({ topic: TOPIC, payload: { count: 2.5 } });
    tally.add({ topic: TOPIC });
    tally.add(undefined);
    expect(tally.total.value).toBe(4);
    tally.reset();
    expect(tally.total.value).toBe(0);
  });

  it("counts every event a pause cut short, not only the first", async () => {
    const live = install({ maxRate: 5 });
    mountBlock();
    await publish({ count: 1 });
    await publish({ count: 3 });
    await publish({ count: 4 });
    live.pause();
    expect(live.missedCount.value).toBe(7);
  });
});

describe("holds", () => {
  it("pauses with a reason while a component holds, and resumes on release", async () => {
    const live = install();
    const block = mountBlock();
    const tester = usePageLive();

    tester.hold("$api.live.typing_in_tester");
    expect(live.isPaused.value).toBe(true);
    expect(live.pauseReason.value).toEqual({
      text: "$api.live.typing_in_tester",
    });
    await publish({ count: 2 });
    expect(block).not.toHaveBeenCalled();

    tester.release();
    expect(live.isPaused.value).toBe(false);
    expect(block).toHaveBeenCalledTimes(1);
  });

  it("stays paused on release when the user paused", () => {
    const live = install();
    const tester = usePageLive();
    tester.hold("typing");
    live.pause();
    expect(live.pauseReason.value).toBeNull();
    tester.release();
    expect(live.isPaused.value).toBe(true);
  });

  it("lets the user resume over a hold until it is taken anew", () => {
    const live = install();
    const tester = usePageLive();
    tester.hold("typing");
    live.resume();
    expect(live.isPaused.value).toBe(false);

    tester.hold("still typing");
    expect(live.isPaused.value).toBe(false);

    tester.release();
    tester.hold("typing again");
    expect(live.isPaused.value).toBe(true);
  });

  it("releases a hold when its component goes", () => {
    const live = install();
    const app = createApp(
      defineComponent({
        setup() {
          usePageLive().hold("typing");
          return () => h("div");
        },
      }),
    );
    app.mount(document.createElement("div"));
    expect(live.isPaused.value).toBe(true);
    app.unmount();
    expect(live.isPaused.value).toBe(false);
  });

  it("keeps a module's breakdown of the missed events until resume", () => {
    const live = install();
    const state = usePageLive();
    live.pause();
    state.setMissedDetail({
      text: "$api.live.in_5xx",
      params: { count: 2 },
      tone: "error",
    });
    expect(state.missedDetail.value?.tone).toBe("error");
    live.resume();
    expect(state.missedDetail.value).toBeNull();
  });
});

describe("the browser around the page", () => {
  it("pauses while the tab is hidden and resumes on return", async () => {
    const live = install();
    const block = mountBlock();
    const unbind = bindPageLiveEnvironment(live, {});

    setVisibility("hidden");
    expect(live.isPaused.value).toBe(true);
    expect(live.pauseReason.value?.text).toBe("$dms.live.reason_hidden");
    await publish();

    setVisibility("visible");
    expect(live.isPaused.value).toBe(false);
    expect(block).toHaveBeenCalledTimes(1);
    unbind();
  });

  it("stays paused on return when the user had paused", () => {
    const live = install();
    const unbind = bindPageLiveEnvironment(live, {});
    live.pause();
    setVisibility("hidden");
    setVisibility("visible");
    expect(live.isPaused.value).toBe(true);
    unbind();
  });

  it("opens paused with ?live=0, unremembered, and drops it on resume", async () => {
    window.history.replaceState(null, "", "/logs?live=0&tab=5xx");
    const { isPausedByUrl } = await import(
      "../layers/dms-ui/app/build/composables/live/usePageLiveHost"
    );
    const live = install({}, { isPausedByUrl: isPausedByUrl() });
    const unbind = bindPageLiveEnvironment(live, {});
    expect(live.isPaused.value).toBe(true);
    expect(window.localStorage.length).toBe(0);

    live.resume();
    await nextTick();
    expect(window.location.search).toBe("?tab=5xx");
    unbind();
  });

  it("shares the remembered choice between the pages of one remember key", () => {
    install({ rememberKey: "api" }).pause();
    expect(
      install({ rememberKey: "api" }, {}, "modules.api.routes").isPaused.value,
    ).toBe(true);
    expect(install({}, {}, "modules.api.routes").isPaused.value).toBe(false);
  });

  it("applies the remembered pause only once the page is mounted", async () => {
    window.localStorage.setItem(`dms.live.paused:${PAGE}`, "1");
    let pausedAtSetup: boolean | undefined;
    const app = createApp(
      defineComponent({
        setup() {
          usePageLiveHost(() => ({ pageId: PAGE, live: {} }));
          pausedAtSetup = currentPageLive()?.isPaused.value;
          return () => h("div");
        },
      }),
    );
    app.mount(document.createElement("div"));
    await nextTick();
    expect(pausedAtSetup).toBe(false);
    expect(currentPageLive()?.isPaused.value).toBe(true);
    app.unmount();
  });
});

describe("the cadence", () => {
  it("polls at maxRate while the stream is down, not while paused", () => {
    const poll = vi.fn();
    const live = install({ maxRate: 5 }, { poll });
    live.setStreamConnected(false);

    expect(live.isPolling.value).toBe(false);

    vi.advanceTimersByTime(5000);
    expect(live.isPolling.value).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(poll).toHaveBeenCalledTimes(2);

    live.pause();
    vi.advanceTimersByTime(20_000);
    expect(poll).toHaveBeenCalledTimes(2);

    live.resume();
    live.setStreamConnected(true);
    vi.advanceTimersByTime(20_000);
    expect(poll).toHaveBeenCalledTimes(2);
    expect(live.isPolling.value).toBe(false);
  });

  it("does not poll a page without a cadence", () => {
    const poll = vi.fn();
    const live = install({}, { poll });
    live.setStreamConnected(false);
    vi.advanceTimersByTime(60_000);
    expect(poll).not.toHaveBeenCalled();
  });

  it("slows down once the period shown reaches slowRateAfter", () => {
    const options = {
      maxRate: 5,
      slowRateAfter: { period: "7d" as const, maxRate: 60 },
    };
    expect(livePeriodMs("7d")).toBe(7 * DAY_MS);
    expect(livePeriodMs("30m")).toBe(30 * 60 * 1000);
    expect(livePeriodMs("week")).toBeNull();
    expect(liveIntervalMs(options, null)).toBe(5000);
    expect(liveIntervalMs(options, DAY_MS)).toBe(5000);
    expect(liveIntervalMs(options, 7 * DAY_MS)).toBe(60_000);
    expect(liveIntervalMs(options, Number.POSITIVE_INFINITY)).toBe(60_000);

    const poll = vi.fn();
    const live = install(options, { poll });
    live.reportPeriodSpan(Symbol("period"), 30 * DAY_MS);
    live.setStreamConnected(false);
    vi.advanceTimersByTime(59_000);
    expect(poll).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it("gates a block at the slower cadence over a long period", async () => {
    const live = install({
      maxRate: 5,
      slowRateAfter: { period: "7d", maxRate: 60 },
    });
    const block = mountBlock();
    const span = ref(7 * DAY_MS);
    live.reportPeriodSpan(Symbol("period"), span.value);
    await publish();
    await publish();
    vi.advanceTimersByTime(5000);
    expect(block).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(55_000);
    expect(block).toHaveBeenCalledTimes(2);
  });
});
