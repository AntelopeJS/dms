// @vitest-environment jsdom
/**
 * A chart on a paused live page sends no request on its events or on a page
 * refresh, and reads once when the page resumes.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import {
  refreshLivePageBlocks,
  refreshPageBlocks,
} from "../layers/dms-ui/app/utils/blockRefresh";
import { createPageLiveController } from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";

const requests: string[] = [];

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return { value: requests.length };
  },
}));
vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
vi.stubGlobal("ref", ref);

const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);

// useChartFetch debounces every refresh past the first by 180ms.
const SETTLE_MS = 250;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

const apps: Array<() => void> = [];

afterEach(() => {
  apps.splice(0).forEach((unmount) => unmount());
  setCurrentPageLive(null);
  window.localStorage.clear();
});

beforeEach(() => useRealDataEngine());

it("requests nothing while paused and reads once on resume", async () => {
  const live = createPageLiveController("api.overview", {});
  setCurrentPageLive(live);
  const app = createApp(
    defineComponent({
      setup() {
        useChartFetch<{ value: number }>({ fetchUrl: "/api/overview/chart" });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  apps.push(() => app.unmount());
  await settle();
  expect(requests).toHaveLength(1);

  live.pause();
  refreshLivePageBlocks();
  refreshLivePageBlocks();
  await settle();
  expect(requests).toHaveLength(1);

  live.resume();
  await settle();
  expect(requests).toHaveLength(2);

  // An action of the user refreshes even while paused.
  live.pause();
  refreshPageBlocks();
  await settle();
  expect(requests).toHaveLength(3);
  live.dispose();
});
