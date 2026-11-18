import { createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/ChartBlock.vue";
import type { ChartType } from "../layers/dms-ui/app/composables/chart/types";
import { chartRuntime } from "./helpers/charts-runtime";

const CARD_SERIES = [
  {
    name: "Plans",
    data: [
      { x: "Starter", y: 3 },
      { x: "Pro", y: 5, label: "Pro plan" },
    ],
  },
];

const PlotProbe = defineComponent({
  props: {
    options: { type: Object, required: true },
    series: { type: Array, required: true },
  },
  setup: (props) => () =>
    h("output", [
      h("span", { class: "labels" }, JSON.stringify(props.options.labels)),
      h("span", { class: "series" }, JSON.stringify(props.series)),
    ]),
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const SLOT_COMPONENTS = [
  "DmsCardPanel",
  "DmsClientOnly",
  "UIcon",
  "USkeleton",
  "DmsTrendBadge",
  "DmsSparklineChart",
  "UBadge",
];

async function renderNested(
  type: ChartType,
  series: ReadonlyArray<object> = CARD_SERIES,
) {
  const app = createSSRApp({
    render: () =>
      h(
        ChartCard,
        {
          title: "Plans",
          componentId: "card",
          pageId: "donut",
          fetchUrl: "/plans",
        },
        () => h(Chart, { type, componentId: "plot", pageId: "donut" }),
      ),
  });
  for (const name of SLOT_COMPONENTS) app.component(name, Slot);
  app.component("DmsApexChartHost", PlotProbe);
  await chartRuntime(app, { value: 8, series });
  await renderToString(app);
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => vi.unstubAllGlobals());

describe("circular chart nested in a ChartCard", () => {
  it.each<ChartType>(["donut", "pie"])(
    "draws the card's first series as %s slices",
    async (type) => {
      const html = await renderNested(type);
      expect(html).not.toContain("dms.chart.no_data");
      expect(html).toContain(
        'class="labels">[&quot;Starter&quot;,&quot;Pro plan&quot;]',
      );
      expect(html).toContain(`class="series">[3,5]`);
    },
  );

  it("draws an answer of one point per group as slices, as a bare chart does (fails when the card shows no data for it)", async () => {
    const html = await renderNested("donut", [
      { x: "Web", y: 928 },
      { x: "Mobile app", y: 354 },
    ]);
    expect(html).not.toContain("dms.chart.no_data");
    expect(html).toContain(
      'class="labels">[&quot;Web&quot;,&quot;Mobile app&quot;]',
    );
    expect(html).toContain(`class="series">[928,354]`);
  });
});
