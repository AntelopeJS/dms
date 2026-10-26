// @vitest-environment jsdom
/**
 * A chart names its series in a legend drawn in the dashboard's colours, at
 * the top of an axis chart or under a circular one unless `legendPosition`
 * says otherwise. Inside a ChartCard the chart's legend stays off, the card
 * heading its single series, until the card asks for it with
 * `showSeriesLegend`: no raw Apex `legend` option is needed for either.
 */
import { createApp, defineComponent, h, ref, type PropType } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChartCard from "../layers/dms-ui/app/components/chart/ChartCard.vue";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";
import type { ChartSeries } from "../layers/dms-ui/app/composables/chart/types";
import { engine } from "./helpers/api-data-runtime";
import { stubBlockRuntime } from "./helpers/block-runtime";

const SERIES: ChartSeries[] = [
  { name: "Average", data: [{ x: "10:00", y: 42 }] },
  { name: "p95", data: [{ x: "10:00", y: 96 }] },
];

interface LegendOptions {
  show: boolean;
  position: string;
}

const LegendProbe = defineComponent({
  props: {
    options: {
      type: Object as PropType<{ legend: LegendOptions }>,
      required: true,
    },
  },
  setup: (props) => () =>
    h("output", {
      "data-show": String(props.options.legend.show),
      "data-position": props.options.legend.position,
    }),
});

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

function legendOf(input: Partial<UseApexChartInput>) {
  const chart = useApexChart(() => ({
    type: "line",
    series: SERIES,
    ...input,
  }));
  return chart.options.value.legend as Record<string, unknown>;
}

async function renderCard(cardProps: Record<string, unknown>) {
  const authFetch = vi.fn().mockResolvedValue({ value: 42, series: SERIES });
  await stubBlockRuntime(authFetch);
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en"),
    t: (key: string) => key,
  }));
  const runtime = engine.createDmsFrontendRuntime();
  const app = createApp({
    render: () =>
      h(
        ChartCard,
        {
          title: "Latency",
          componentId: "card",
          pageId: "routes",
          fetchUrl: "/api/latency",
          ...cardProps,
        },
        () =>
          h(Chart, {
            type: "line",
            componentId: "plot",
            pageId: "routes",
            legendPosition: "bottom",
          }),
      ),
  });
  engine.provideDmsFrontendRuntime(app, runtime);
  for (const name of ["DmsCard", "DmsClientOnly", "UIcon", "USkeleton"])
    app.component(name, Slot);
  app.component("DmsApexChartHost", LegendProbe);
  const host = document.createElement("div");
  try {
    app.mount(host);
    await vi.waitFor(() => expect(host.querySelector("output")).not.toBeNull());
    expect(authFetch).toHaveBeenCalledExactlyOnceWith(
      "/api/latency",
      expect.any(Object),
    );
    return host.innerHTML;
  } finally {
    app.unmount();
    runtime.scope.stop();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("chart legend", () => {
  it("sits above an axis chart and under a circular one by default", () => {
    expect(legendOf({}).position).toBe("top");
    expect(legendOf({ type: "donut", series: [] }).position).toBe("bottom");
  });

  it("follows legendPosition", () => {
    expect(legendOf({ legendPosition: "bottom" }).position).toBe("bottom");
    expect(
      legendOf({ type: "donut", series: [], legendPosition: "top" }).position,
    ).toBe("top");
  });

  it("is drawn in the dashboard's theme", () => {
    const legend = legendOf({});
    expect(legend.show).toBe(true);
    expect(legend.markers).toMatchObject({ shape: "square", strokeWidth: 0 });
    expect(legend.labels).toHaveProperty("colors");
  });
});

describe("series legend of a ChartCard", () => {
  it("stays off in a card by default", async () => {
    const html = await renderCard({});
    expect(html).toContain('data-show="false"');
  });

  it("names the series where the chart places it when the card asks", async () => {
    const html = await renderCard({ showSeriesLegend: true });
    expect(html).toContain('data-show="true"');
    expect(html).toContain('data-position="bottom"');
  });
});
