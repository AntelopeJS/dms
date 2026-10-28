import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import type { ChartType } from "../layers/dms-ui/app/composables/chart/types";
import { chartRuntime } from "./helpers/charts-runtime";

const HEATMAP_SERIES = [
  { name: "Mon", data: [{ x: "09:00", y: 1200 }] },
  { name: "Tue", data: [{ x: "09:00", y: 3400 }] },
];

const PlotProbe = defineComponent({
  props: {
    options: { type: Object, required: true },
  },
  setup: (props) => () =>
    h("output", [
      h(
        "span",
        { class: "rows" },
        HEATMAP_SERIES.map(({ name }) =>
          props.options.yaxis.labels.formatter(name),
        ).join("|"),
      ),
      h(
        "span",
        { class: "value" },
        props.options.tooltip.y?.formatter(1200) ?? "",
      ),
    ]),
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

async function renderCard(type: ChartType) {
  const app = createSSRApp({
    render: () =>
      h(
        ChartCard,
        {
          title: "Load",
          componentId: "card",
          pageId: "p",
          fetchUrl: "/load",
          valueFormat: "currency",
          currencyCode: "EUR",
          valuePrecision: 0,
        },
        () => h(Chart, { type, componentId: "plot", pageId: "p" }),
      ),
  });
  for (const name of ["DmsCard", "DmsClientOnly", "UIcon", "USkeleton"]) {
    app.component(name, Slot);
  }
  app.component("DmsApexChartHost", PlotProbe);
  await chartRuntime(app, { value: 4600, series: HEATMAP_SERIES });
  await renderToString(app);
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => vi.unstubAllGlobals());

describe("a heatmap inside a ChartCard", () => {
  it("names its rows as sent, not through the card's value format", async () => {
    const html = await renderCard("heatmap");
    expect(html).toContain('class="rows">Mon|Tue<');
    expect(html).not.toContain("NaN");
  });

  it("still formats its values", async () => {
    expect(await renderCard("heatmap")).toContain('class="value">€1,200<');
  });

  it("keeps formatting a value axis", async () => {
    const html = await renderCard("column");
    expect(html).toContain('class="value">€1,200<');
  });
});
