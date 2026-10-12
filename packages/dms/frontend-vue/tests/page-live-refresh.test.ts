// @vitest-environment jsdom
/**
 * `usePageLiveRefresh`, the public face of the Direct / Pause gate: a module's
 * own component refreshes on its topic at the page's `maxRate`, counts what
 * it missed while paused and reads once on resume, reads at once on a user's
 * refresh, and, with `idleRefresh`, reads again after a quiet period while
 * the page is live only.
 */
import { createApp, defineComponent, h } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RealtimeTopicHandler } from "../layers/dms-core/app/composables/realtime/useUserRealtime";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";
import {
  createPageLiveController,
  type PageLiveController,
} from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import type {
  PageLiveRefresh,
  PageLiveRefreshOptions,
} from "../layers/dms-ui/app/composables/live/usePageLiveRefresh";

const topicHandlers = new Map<string, RealtimeTopicHandler[]>();

vi.mock("../layers/dms-core/app/composables/realtime/useRealtimeTopic", () => ({
  useRealtimeTopic: (topic: string, handler: RealtimeTopicHandler) => {
    topicHandlers.set(topic, [...(topicHandlers.get(topic) ?? []), handler]);
  },
}));

const { usePageLiveRefresh } = await import(
  "../layers/dms-ui/app/composables/live/usePageLiveRefresh"
);

const TOPIC = "api:requests";
const MAX_RATE_SECONDS = 15;
const MAX_RATE_MS = MAX_RATE_SECONDS * 1000;
const IDLE_SECONDS = 60;
const mounted: Array<{ unmount: () => void }> = [];
const controllers: PageLiveController[] = [];

function publish() {
  const event = { topic: TOPIC, type: "request", ts: Date.now() };
  for (const handler of topicHandlers.get(TOPIC) ?? []) handler(event);
}

interface MountedRefresh {
  onRefresh: ReturnType<typeof vi.fn>;
  handle: PageLiveRefresh;
}

function mountComponent(
  options: PageLiveRefreshOptions = { realtimeTopic: TOPIC },
): MountedRefresh {
  const onRefresh = vi.fn();
  let handle: PageLiveRefresh | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        handle = usePageLiveRefresh(onRefresh, options);
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  mounted.push(app);
  return { onRefresh, handle: handle! };
}

function installLive(): PageLiveController {
  const controller = createPageLiveController("api.routes", {
    maxRate: MAX_RATE_SECONDS,
  });
  controllers.push(controller);
  setCurrentPageLive(controller);
  return controller;
}

beforeEach(() => {
  vi.useFakeTimers();
  topicHandlers.clear();
  window.localStorage.clear();
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  controllers.splice(0).forEach((controller) => controller.dispose());
  setCurrentPageLive(null);
  vi.useRealTimers();
});

it("reads on its topic at the page's maxRate, the last event of a burst kept", () => {
  installLive();
  const { onRefresh } = mountComponent();

  publish();
  publish();
  publish();
  expect(onRefresh).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(MAX_RATE_MS);
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("reads nothing while paused, counts what it missed, and reads once on resume", () => {
  const controller = installLive();
  const { onRefresh, handle } = mountComponent();
  controller.pause();

  publish();
  publish();
  expect(onRefresh).not.toHaveBeenCalled();
  expect(handle.missed.value).toBe(2);
  expect(controller.missedCount.value).toBe(2);

  controller.resume();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(handle.missed.value).toBe(0);
});

it("reads at once on a refresh the user asks for, paused or not", () => {
  const controller = installLive();
  const { onRefresh, handle } = mountComponent();
  controller.pause();

  refreshPageBlocks();
  expect(onRefresh).toHaveBeenCalledTimes(1);

  handle.refreshNow();
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("gates its own trigger like an event", () => {
  const controller = installLive();
  const { onRefresh, handle } = mountComponent({});
  controller.pause();

  handle.trigger();
  expect(onRefresh).not.toHaveBeenCalled();
  expect(handle.missed.value).toBe(1);
});

it("reads again after a quiet idleRefresh while live, never while paused", () => {
  const controller = installLive();
  const { onRefresh } = mountComponent({
    realtimeTopic: TOPIC,
    idleRefresh: IDLE_SECONDS,
  });

  vi.advanceTimersByTime(IDLE_SECONDS * 1000);
  expect(onRefresh).toHaveBeenCalledTimes(1);

  controller.pause();
  vi.advanceTimersByTime(IDLE_SECONDS * 3000);
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(controller.missedCount.value).toBe(0);

  controller.resume();
  vi.advanceTimersByTime(IDLE_SECONDS * 1000);
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("reads on every event on a page without live", () => {
  const { onRefresh } = mountComponent();

  publish();
  publish();
  expect(onRefresh).toHaveBeenCalledTimes(2);
});
