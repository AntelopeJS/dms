import { createSSRApp, defineComponent, h, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import type { ChartType } from "../layers/dms-ui/app/composables/chart/types";

const CARD_SERIES = [
  {
    name: "Plans",
    data: [
      { x: "Starter", y: 3 },
      { x: "Pro", y: 5, label: "Pro plan" },
    ],
  },
];

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: (options: { fetchUrl?: string }) => ({
    data: ref(options.fetchUrl ? { value: 8, series: CARD_SERIES } : null),
    isLoading: ref(false),
  }),
}));

interface CircularOptions {
  labels?: string[];
}

const PlotProbe = defineComponent({
  props: {
    options: { type: Object as PropType<CircularOptions>, required: true },
    series: { type: Array as PropType<unknown[]>, required: true },
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
  "DmsCard",
  "DmsClientOnly",
  "UIcon",
  "USkeleton",
  "DmsTrendBadge",
  "DmsSparkline",
  "UBadge",
];

async function renderNested(type: ChartType) {
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
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
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
});
