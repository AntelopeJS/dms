/** @vitest-environment jsdom */
import { createApp, h, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ApexChartHost from "../layers/dms-ui/app/components/chart/ApexChartHost.vue";
import { installApexDom } from "./helpers/chart-extra-runtime";

const HOST_WIDTH = 520;
const STALE_WIDTH = 536;
let drawnWidth = HOST_WIDTH;
let app: ReturnType<typeof createApp> | undefined;
const mounted = vi.fn();
const updated = vi.fn();
const observers: Array<{ deliver: () => void }> = [];

/**
 * A ResizeObserver whose deliveries the test triggers, as a browser makes one
 * each time the observed box changes size.
 */
class ControlledResizeObserver implements ResizeObserver {
  readonly #callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
    observers.push(this);
  }

  deliver() {
    this.#callback([], this);
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

async function mountDonut() {
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(() =>
    h(ApexChartHost, {
      apexType: "donut",
      height: 280,
      options: {
        chart: {
          animations: { enabled: false },
          events: { mounted, updated },
        },
        labels: ["Panels", "Batteries", "Inverters"],
        legend: { position: "bottom" },
      },
      series: [5, 3, 2],
    }),
  );
  app.mount(root);
  await vi.waitFor(() => expect(mounted).toHaveBeenCalled(), {
    timeout: 3000,
  });
}

function deliverResizes(count: number) {
  for (let delivery = 0; delivery < count; delivery++) {
    for (const observer of observers) observer.deliver();
  }
}

beforeEach(() => {
  installApexDom();
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  observers.length = 0;
  drawnWidth = HOST_WIDTH;
  mounted.mockClear();
  updated.mockClear();
  vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return new DOMRect(
        0,
        0,
        this.matches("svg.apexcharts-svg") ? drawnWidth : HOST_WIDTH,
        280,
      );
    },
  );
});

afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
  observers.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("redraws nothing when only the donut's host height changes", async () => {
  await mountDonut();
  deliverResizes(3);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(updated).not.toHaveBeenCalled();
});

it("redraws an unanimated chart drawn at another width than its host", async () => {
  drawnWidth = STALE_WIDTH;
  await mountDonut();
  deliverResizes(1);
  await vi.waitFor(() => expect(updated).toHaveBeenCalled(), { timeout: 3000 });
});
