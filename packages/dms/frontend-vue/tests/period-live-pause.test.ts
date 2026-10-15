// @vitest-environment jsdom
/**
 * A rolling period (`last-hour`, `last-24h`) slides every minute, and every
 * block reading it refetches. On a paused live page the period holds still,
 * so nothing refetches on the clock; a period the user picks still applies at
 * once, and resuming catches the skipped minutes up in one read.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { createPageLiveController } from "../layers/dms-ui/app/build/composables/live/pageLiveController";
import { setCurrentPageLive } from "../layers/dms-ui/app/build/composables/live/currentPageLive";
import { usePageLive } from "../layers/dms-ui/app/composables/live/usePageLive";
import {
  usePeriod,
  type UsePeriodReturn,
} from "../layers/dms-core/app/composables/period/usePeriod";
import { registerPeriodScope } from "../layers/dms-core/app/composables/period/usePeriodScope";

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

const SCOPE = "live-period";
const MINUTE_MS = 60_000;
const apps: Array<() => void> = [];

function mountPageWithChart(): UsePeriodReturn {
  let period: UsePeriodReturn | undefined;
  const app = createApp(
    defineComponent({
      setup() {
        const { isPaused } = usePageLive();
        // As the PeriodSelector wires it.
        period = usePeriod({
          defaultPreset: "last-hour",
          holdClock: () => isPaused.value,
        });
        registerPeriodScope(SCOPE, period.state);
        useChartFetch({ fetchUrl: "/api/chart", periodScope: SCOPE });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  apps.push(() => app.unmount());
  return period!;
}

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  vi.useFakeTimers();
  requests.length = 0;
  window.localStorage.clear();
});

afterEach(() => {
  apps.splice(0).forEach((unmount) => unmount());
  setCurrentPageLive(null);
  vi.useRealTimers();
});

it("slides and refetches every minute in Direct", async () => {
  setCurrentPageLive(createPageLiveController("api.overview", {}));
  mountPageWithChart();
  await vi.advanceTimersByTimeAsync(1000);
  expect(requests).toHaveLength(1);

  await vi.advanceTimersByTimeAsync(2 * MINUTE_MS);
  expect(requests).toHaveLength(3);
});

it("holds the period while paused, but follows the user's pick", async () => {
  const live = createPageLiveController("api.overview", {});
  setCurrentPageLive(live);
  const period = mountPageWithChart();
  await vi.advanceTimersByTimeAsync(1000);
  expect(requests).toHaveLength(1);

  live.pause();
  const heldKey = period.state.value.key;
  await vi.advanceTimersByTimeAsync(3 * MINUTE_MS);
  expect(requests).toHaveLength(1);
  expect(period.state.value.key).toBe(heldKey);

  period.setPreset("last-24h");
  await vi.advanceTimersByTimeAsync(1000);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toContain("preset=last-24h");

  await vi.advanceTimersByTimeAsync(2 * MINUTE_MS);
  expect(requests).toHaveLength(2);

  live.resume();
  await vi.advanceTimersByTimeAsync(1000);
  expect(requests).toHaveLength(3);
  expect(period.state.value.key).not.toBe(heldKey);
});
