// @vitest-environment jsdom
import { createApp, h, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ApexChartHost from "../layers/dms-ui/app/components/chart/ApexChartHost.vue";
import { installApexDom } from "./helpers/chart-extra-runtime";

const HOST_WIDTH = 1047;
const STALE_WIDTH = 1227;
let drawnWidth = HOST_WIDTH;
let app: ReturnType<typeof createApp> | undefined;
const animationEnded = vi.fn();
const updated = vi.fn();

async function mountHost() {
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(() =>
    h(ApexChartHost, {
      apexType: "line",
      height: 300,
      options: {
        chart: {
          animations: {
            enabled: true,
            speed: 20,
            animateGradually: { enabled: false },
          },
          events: { animationEnd: animationEnded, updated },
        },
      },
      series: [{ name: "Revenue", data: [1, 3, 2] }],
    }),
  );
  app.mount(root);
  await vi.waitFor(() => expect(animationEnded).toHaveBeenCalled(), {
    timeout: 3000,
  });
  return root;
}

beforeEach(() => {
  installApexDom();
  drawnWidth = HOST_WIDTH;
  animationEnded.mockClear();
  updated.mockClear();
  vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return new DOMRect(
        0,
        0,
        this.matches("svg.apexcharts-svg") ? drawnWidth : HOST_WIDTH,
        300,
      );
    },
  );
});

afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("redraws a chart left at a stale width when its animation ends", async () => {
  drawnWidth = STALE_WIDTH;
  const root = await mountHost();
  await vi.waitFor(() => expect(updated).toHaveBeenCalled(), { timeout: 3000 });
  expect(root.querySelector("svg.apexcharts-svg")).not.toBeNull();
});

it("leaves a chart drawn at its host's width alone", async () => {
  await mountHost();
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(updated).not.toHaveBeenCalled();
});
