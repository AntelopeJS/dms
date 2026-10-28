import { createSSRApp, defineComponent, h, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import type {
  ChartSeries,
  ChartType,
} from "../layers/dms-ui/app/composables/chart/types";
import { chartRuntime } from "./helpers/charts-runtime";

const ROUTE_SERIES: ChartSeries[] = [
  {
    name: "$shop.plans.series",
    data: [
      { x: "$shop.plans.starter", y: 3 },
      { x: "Pro", y: 5, label: "$shop.plans.pro" },
      { x: "2026-10-01", y: 1 },
    ],
  },
];

interface ProbeOptions {
  labels?: string[];
}

const PlotProbe = defineComponent({
  props: {
    options: { type: Object as PropType<ProbeOptions>, required: true },
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
  "UBadge",
];

async function render(build: () => ReturnType<typeof h>) {
  const app = createSSRApp({ render: build });
  for (const name of SLOT_COMPONENTS) app.component(name, Slot);
  app.component("DmsApexChartHost", PlotProbe);
  await chartRuntime(app, { value: 9, series: ROUTE_SERIES });
  await renderToString(app);
  return renderToString(app);
}

function nested(type: ChartType) {
  return render(() =>
    h(
      ChartCard,
      { title: "Plans", componentId: "card", pageId: "p", fetchUrl: "/plans" },
      () => h(Chart, { type, componentId: "plot", pageId: "p" }),
    ),
  );
}

function bare(type: ChartType, props: Record<string, unknown> = {}) {
  return render(() =>
    h(Chart, { type, componentId: "plot", pageId: "p", ...props }),
  );
}

function decoded(html: string): string {
  return html.replaceAll("&quot;", '"');
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-US"),
    t: (key: string) => `«${key}»`,
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("chart texts a route sends as $ keys", () => {
  it.each<ChartType>(["donut", "pie"])(
    "translates the slice labels of a %s in a ChartCard",
    async (type) => {
      const html = decoded(await nested(type));
      expect(html).toContain(
        'class="labels">["«shop.plans.starter»","«shop.plans.pro»","2026-10-01"]',
      );
    },
  );

  it("translates the slice labels of a bare donut", async () => {
    const html = decoded(await bare("donut", { fetchUrl: "/plans" }));
    expect(html).toContain('"«shop.plans.starter»","«shop.plans.pro»"');
  });

  it("translates a bare static donut's labels", async () => {
    const html = decoded(
      await bare("donut", {
        staticDataset: [{ label: "$shop.plans.free", value: 2 }],
      }),
    );
    expect(html).toContain('class="labels">["«shop.plans.free»"]');
  });

  it.each([
    ["in a ChartCard", () => nested("column")],
    ["in a bare chart", () => bare("column", { fetchUrl: "/plans" })],
    [
      "in a bare static chart",
      () => bare("column", { staticDataset: ROUTE_SERIES }),
    ],
  ])("translates series names, categories and labels %s", async (_, draw) => {
    const html = decoded(await draw());
    expect(html).toContain('"name":"«shop.plans.series»"');
    expect(html).toContain('"x":"«shop.plans.starter»"');
    expect(html).toContain('"label":"«shop.plans.pro»"');

    expect(html).toContain('"x":"Pro"');
    expect(html).toContain('"x":"2026-10-01"');
  });
});
