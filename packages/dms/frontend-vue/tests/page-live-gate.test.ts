// @vitest-environment jsdom
/**
 * The Direct / Pause valve of a page declared with `live`: in Direct a block
 * refetches on its events at most once per `maxRate` (the last event of a
 * burst included), paused it requests nothing and counts what it missed, and
 * resuming refetches once each block that missed something. The choice is
 * kept per page in the browser, and a page without `live` is untouched.
 */
import { createApp, defineComponent, h } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { liveShellRuntime } from "./helpers/live-shell-runtime";
import {
  refreshLivePageBlocks,
  refreshPageBlocks,
} from "../layers/dms-ui/app/utils/blockRefresh";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import { usePageLive } from "../layers/dms-ui/app/composables/live/usePageLive";

const realtime = liveShellRuntime();

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);

const PAGE = "monitoring.logs";
const TOPIC = "api:requests";
const MAX_RATE_SECONDS = 5;
const MAX_RATE_MS = MAX_RATE_SECONDS * 1000;
const mounted: Array<{ unmount: () => void }> = [];
const controllers: PageLiveController[] = [];

function publish(topic = TOPIC) {
  return realtime.publish(topic);
}

function mountBlock(topic: string | undefined = TOPIC) {
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

function installLive(maxRate?: number): PageLiveController {
  const controller = createPageLiveController(PAGE, { maxRate });
  controllers.push(controller);
  setCurrentPageLive(controller);
  return controller;
}

beforeEach(async () => {
  vi.stubGlobal("isDmsHydrating", () => false);
  vi.useFakeTimers();
  await realtime.start();
  window.localStorage.clear();
});

afterEach(async () => {
  mounted.splice(0).forEach((app) => app.unmount());
  controllers.splice(0).forEach((controller) => controller.dispose());
  setCurrentPageLive(null);
  await realtime.stop();
  vi.useRealTimers();
});

it("leaves a page without live as it was: every event refetches", async () => {
  const onRefresh = mountBlock();
  await publish();
  await publish();
  refreshPageBlocks();
  refreshLivePageBlocks();
  expect(onRefresh).toHaveBeenCalledTimes(4);
  expect(usePageLive().isEnabled.value).toBe(false);
  expect(usePageLive().isLive.value).toBe(true);
});

it("refetches on each event in Direct when no maxRate is set", async () => {
  installLive();
  const onRefresh = mountBlock();
  await publish();
  await publish();
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("in Direct, refetches at most once per maxRate, the last event trailing", async () => {
  installLive(MAX_RATE_SECONDS);
  const onRefresh = mountBlock();

  await publish();
  expect(onRefresh).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1000);
  await publish();
  vi.advanceTimersByTime(1000);
  await publish();
  expect(onRefresh).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(MAX_RATE_MS - 2000);
  expect(onRefresh).toHaveBeenCalledTimes(2);

  vi.advanceTimersByTime(MAX_RATE_MS * 2);
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("caps each block on its own", async () => {
  installLive(MAX_RATE_SECONDS);
  const first = mountBlock();
  const second = mountBlock("api:routes");
  await publish();
  await publish("api:routes");
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});

it("in Pause, requests nothing and counts the events per block", async () => {
  const live = installLive();
  const logs = mountBlock();
  const chart = mountBlock();
  const routes = mountBlock("api:routes");
  live.pause();

  await publish();
  await publish();
  refreshLivePageBlocks();
  vi.advanceTimersByTime(60_000);

  expect(logs).not.toHaveBeenCalled();
  expect(chart).not.toHaveBeenCalled();
  expect(routes).not.toHaveBeenCalled();
  // Two events and a live refresh, each counted once for the page although
  // two blocks (three for the refresh) received them.
  expect(live.missedCount.value).toBe(3);
  expect(usePageLive().isPaused.value).toBe(true);
});

it("refreshes on a user's refreshPageBlocks even while paused", async () => {
  const live = installLive(MAX_RATE_SECONDS);
  const onRefresh = mountBlock();
  live.pause();
  await publish();
  expect(live.missedCount.value).toBe(1);

  refreshPageBlocks();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(live.isPaused.value).toBe(true);

  // Read by the user, the block has nothing left to read on resume.
  live.resume();
  expect(onRefresh).toHaveBeenCalledTimes(1);
});

it("caps a live refresh like a realtime event in Direct", () => {
  installLive(MAX_RATE_SECONDS);
  const onRefresh = mountBlock(undefined);
  refreshLivePageBlocks();
  refreshLivePageBlocks();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(MAX_RATE_MS);
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("on resume, refetches once each block that missed an event", async () => {
  const live = installLive(MAX_RATE_SECONDS);
  const logs = mountBlock();
  const routes = mountBlock("api:routes");
  await publish("api:routes");
  routes.mockClear();
  live.pause();

  await publish();
  await publish();
  await publish();
  live.resume();

  expect(logs).toHaveBeenCalledTimes(1);
  expect(routes).not.toHaveBeenCalled();
  expect(live.missedCount.value).toBe(0);
  vi.advanceTimersByTime(MAX_RATE_MS);
  expect(logs).toHaveBeenCalledTimes(1);
});

it("keeps a trailing refetch the pause interrupted for the resume", async () => {
  const live = installLive(MAX_RATE_SECONDS);
  const onRefresh = mountBlock();
  await publish();
  await publish();
  live.pause();
  vi.advanceTimersByTime(MAX_RATE_MS);
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(live.missedCount.value).toBe(1);

  live.resume();
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("dates the page's last update from its refetches", async () => {
  const live = installLive();
  mountBlock();
  const before = live.lastUpdatedAt.value;
  vi.advanceTimersByTime(4000);
  await publish();
  expect(live.lastUpdatedAt.value).toBe(before + 4000);
});

it("remembers the choice per page in the browser", () => {
  installLive().pause();
  expect(createPageLiveController(PAGE, {}).isPaused.value).toBe(true);
  expect(createPageLiveController("monitoring.routes", {}).isPaused.value).toBe(
    false,
  );

  createPageLiveController(PAGE, {}).resume();
  expect(createPageLiveController(PAGE, {}).isPaused.value).toBe(false);
});

it("follows the page through usePageLive", () => {
  installLive();
  const state = usePageLive();
  expect(state.isEnabled.value).toBe(true);
  state.pause();
  expect(state.isPaused.value).toBe(true);
  expect(state.isLive.value).toBe(false);
  state.toggle();
  expect(state.isPaused.value).toBe(false);
});
