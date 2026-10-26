/** @vitest-environment jsdom */
import { createSSRApp, defineComponent, h, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import { chartRuntime } from "./helpers/charts-runtime";
import { clearChartColorCache } from "../layers/dms-ui/app/composables/chart/useChartTheme";

const LIGHT_SURFACE = "rgb(255, 255, 255)";
const DARK_SURFACE = "rgb(10, 10, 10)";
const surface = { value: LIGHT_SURFACE };

const ROWS = [
  {
    name: "Mon",
    data: [
      { x: "09:00", y: 0 },
      { x: "10:00", y: 50 },
    ],
  },
  {
    name: "Tue",
    data: [
      { x: "09:00", y: 100 },
      { x: "10:00", y: 25 },
    ],
  },
];

interface HeatmapOptions {
  theme?: { mode?: string };
  plotOptions: {
    heatmap: {
      enableShades?: boolean;
      colorScale?: { ranges: Array<{ color: string }> };
    };
  };
}

const PlotProbe = defineComponent({
  props: {
    options: { type: Object as PropType<HeatmapOptions>, required: true },
  },
  setup: (props) => () => h("output", JSON.stringify(props.options)),
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function heatmapOptions(
  props: Record<string, unknown>,
): Promise<HeatmapOptions> {
  clearChartColorCache();
  const app = createSSRApp({
    render: () =>
      h(Chart, {
        type: "heatmap",
        componentId: "heat",
        pageId: "p",
        staticDataset: ROWS,
        ...props,
      }),
  });
  for (const name of ["DmsClientOnly", "USkeleton"]) {
    app.component(name, Slot);
  }
  app.component("DmsApexChartHost", PlotProbe);
  await chartRuntime(app);
  const html = await renderToString(app);
  const json = /<output[^>]*>(.*)<\/output>/.exec(html)![1]!;
  return JSON.parse(json.replaceAll("&quot;", '"'));
}

function rangeColors(options: HeatmapOptions): string[] {
  return (options.plotOptions.heatmap.colorScale?.ranges ?? []).map(
    (range) => range.color,
  );
}

beforeEach(() => {
  surface.value = LIGHT_SURFACE;
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("getComputedStyle", (element: HTMLElement) => ({
    backgroundColor: element.style.backgroundColor.includes("--ui-bg")
      ? surface.value
      : "rgb(128, 128, 128)",
    getPropertyValue: () => "",
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("heatmap colours", () => {
  it("shades one colour towards the card of either theme", async () => {
    const light = await heatmapOptions({ color: "#ff0000" });
    surface.value = DARK_SURFACE;
    const dark = await heatmapOptions({ color: "#ff0000" });
    expect(light.theme?.mode).toBe("light");
    expect(dark.theme?.mode).toBe("dark");
  });

  it("shades a distributed heatmap per theme too", async () => {
    surface.value = DARK_SURFACE;
    const options = await heatmapOptions({
      color: ["#ff0000", "#0000ff"],
      distributed: true,
    });
    expect(options.theme?.mode).toBe("dark");
  });

  it("fades several colours from the card surface to full", async () => {
    const colors = ["#ff0000", "#00ff00", "#0000ff"];
    const light = await heatmapOptions({ color: colors, shadeIntensity: 0.6 });
    surface.value = DARK_SURFACE;
    const dark = await heatmapOptions({ color: colors, shadeIntensity: 0.6 });

    expect(rangeColors(light)[0]).toBe("rgb(255, 153, 153)");
    expect(rangeColors(dark)[0]).toBe("rgb(108, 6, 6)");

    expect(rangeColors(light).at(-1)).toBe("rgb(0, 0, 255)");
    expect(rangeColors(dark).at(-1)).toBe("rgb(0, 0, 255)");

    expect(dark.plotOptions.heatmap.enableShades).toBe(false);
  });

  it("leaves the theme of every other chart to its options", async () => {
    surface.value = DARK_SURFACE;
    expect((await heatmapOptions({ type: "column" })).theme).toBeUndefined();
  });
});
