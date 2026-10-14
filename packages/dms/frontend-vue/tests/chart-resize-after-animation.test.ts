// @vitest-environment jsdom
/**
 * Apex drops its container's resizes while an animation runs: a sidebar
 * toggled during the intro animation left the chart at its old width, past
 * its card, until the next window resize. The host redraws such a chart once
 * the animation ends.
 */
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ApexChartHost from "../layers/dms-ui/app/components/chart/ApexChartHost.vue";

const HOST_WIDTH = 1047;
const STALE_WIDTH = 1227;

const windowResizeHandler = vi.fn();
const drawnWidth = ref(HOST_WIDTH);
let endAnimation: () => void = () => {};

vi.mock("apexcharts", () => ({ default: {} }));
vi.mock("../layers/dms-ui/app/composables/chart/apexLocales", () => ({
  ensureApexLocale: async () => undefined,
}));
vi.mock("vue3-apexcharts", () => ({
  default: defineComponent({
    emits: ["animationEnd"],
    setup(_, { emit, expose }) {
      expose({
        chart: { windowResizeHandler },
        updateOptions: async () => undefined,
      });
      endAnimation = () => emit("animationEnd");
      return () =>
        h("div", [
          h("svg", {
            class: "apexcharts-svg",
            "data-width": drawnWidth.value,
          }),
        ]);
    },
  }),
}));

function widthOf(element: Element): number {
  if (element.classList.contains("dms-apex")) return HOST_WIDTH;
  return Number(element.getAttribute("data-width") ?? 0);
}

let app: ReturnType<typeof createApp> | undefined;

async function mountHost(): Promise<HTMLElement> {
  const root = document.createElement("div");
  app = createApp(() =>
    h(ApexChartHost, {
      apexType: "line",
      height: 300,
      options: {},
      series: [],
    }),
  );
  app.mount(root);
  await vi.waitFor(() => {
    expect(root.querySelector("svg.apexcharts-svg")).not.toBeNull();
  });
  return root;
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return { width: widthOf(this) } as DOMRect;
    },
  );
});

afterEach(() => {
  app?.unmount();
  windowResizeHandler.mockClear();
  drawnWidth.value = HOST_WIDTH;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("redraws a chart left at a stale width when its animation ends", async () => {
  await mountHost();
  drawnWidth.value = STALE_WIDTH;
  await nextTick();

  endAnimation();

  expect(windowResizeHandler).toHaveBeenCalledOnce();
});

it("leaves a chart drawn at its host's width alone", async () => {
  await mountHost();

  endAnimation();

  expect(windowResizeHandler).not.toHaveBeenCalled();
});
