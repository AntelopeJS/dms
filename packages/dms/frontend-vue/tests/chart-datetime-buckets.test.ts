import { createSSRApp, defineComponent, h, ref, type PropType } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Chart from "../layers/dms-ui/app/components/chart/Chart.vue";
import type { ChartClickPayload } from "../layers/dms-ui/app/composables/chart/events";
import type { ChartSeries } from "../layers/dms-ui/app/composables/chart/types";
import { chartRuntime } from "./helpers/charts-runtime";

type LabelFormatter = (
  value: string,
  timestamp?: number,
  opts?: { dateFormatter?: unknown; w?: unknown },
) => string;

interface ProbedOptions {
  chart: {
    events?: {
      dataPointSelection?: (
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The vendor event argument is opaque and unused; preserve the callback's raw input contract.
        event: unknown,
        // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The vendor chart context is opaque and unused by point selection.
        context: unknown,
        opts: { seriesIndex: number; dataPointIndex: number },
      ) => void;
    };
  };
  xaxis: { type: string; labels: { formatter?: LabelFormatter } };
  tooltip: { x?: { formatter?: (value: string) => string } };
}

interface Probed {
  options: ProbedOptions;
  series: ChartSeries[];
}

let probed: Probed | null = null;

const PlotProbe = defineComponent({
  props: {
    // SAFETY: The chart host supplies the options whose formatter and events this probe exercises.
    options: { type: Object as PropType<ProbedOptions>, required: true },
    // SAFETY: The chart host supplies the ChartSeries array captured by this probe.
    series: { type: Array as PropType<ChartSeries[]>, required: true },
  },
  setup: (props) => () => {
    probed = { options: props.options, series: props.series };
    return h("output");
  },
});
const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

function stacked(dates: string[]): ChartSeries[] {
  return ["Plan A", "Plan B"].map((name, offset) => ({
    name,
    data: dates.map((x, index) => ({ x, y: 10 + index + offset })),
  }));
}

async function draw(
  dates: string[],
  props: Partial<InstanceType<typeof Chart>["$props"]> = {},
): Promise<Probed> {
  probed = null;
  const app = createSSRApp({
    render: () =>
      h(Chart, {
        type: "column",
        stacked: true,
        xaxisType: "datetime",
        componentId: "revenue",
        pageId: "p",
        staticDataset: stacked(dates),
        ...props,
      }),
  });
  for (const name of ["DmsClientOnly", "USkeleton"]) {
    app.component(name, Slot);
  }
  app.component("DmsApexChartHost", PlotProbe);
  await chartRuntime(app);
  await renderToString(app);
  return probed!;
}

function axisLabels(chart: Probed): string[] {
  const format = chart.options.xaxis.labels.formatter!;
  return chart.series[0]!.data.map((point) =>
    // SAFETY: stacked() supplies string x coordinates; datetime gap filling also emits string x coordinates.
    format((point as { x: string }).x),
  );
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
});

afterEach(() => vi.unstubAllGlobals());

describe("a column chart of calendar buckets on a datetime axis", () => {
  it("draws one column and one label per month", async () => {
    const chart = await draw(["2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(chart.options.xaxis.type).toBe("category");
    expect(axisLabels(chart)).toEqual(["Aug 26", "Sep 26", "Oct 26"]);
    expect(chart.options.tooltip.x?.formatter?.("2026-09-01")).toBe(
      "September 2026",
    );
  });

  it("reads UTC-midnight months the way a route sends them", async () => {
    const chart = await draw([
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    ]);
    expect(chart.options.xaxis.type).toBe("category");
    expect(
      // SAFETY: stacked() supplies string x coordinates and this case checks their UTC normalization.
      chart.series[0]!.data.map((point) => (point as { x: string }).x),
    ).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("draws one column and one label per day", async () => {
    const chart = await draw(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(axisLabels(chart)).toEqual(["Oct 01", "Oct 02", "Oct 03"]);
  });

  it("writes the labels in Apex's tokens when Apex lends its formatter", async () => {
    const chart = await draw(["2026-08-01", "2026-09-01"], {
      xAxis: { datetimeFormat: "MMM" },
    });
    const dateFormatter = vi.fn(function (
      this: { w: unknown },
      date: Date,
      format: string,
    ) {
      return `${format}:${date.getMonth() + 1}:${String(this.w)}`;
    });
    const label = chart.options.xaxis.labels.formatter!("2026-09-01", 0, {
      dateFormatter,
      w: "apex",
    });
    expect(label).toBe("MMM:9:apex");
  });

  it("keeps an empty month in its slot", async () => {
    const chart = await draw(["2026-06-01", "2026-07-01", "2026-09-01"]);
    expect(axisLabels(chart)).toEqual(["Jun 26", "Jul 26", "Aug 26", "Sep 26"]);
    expect(chart.series[0]!.data[2]).toEqual({ x: "2026-08-01", y: null });
  });

  it("names the route's point when a column after a gap is clicked", async () => {
    vi.stubGlobal("window", new EventTarget());
    const clicks: ChartClickPayload[] = [];
    const chart = await draw(["2026-06-01", "2026-07-01", "2026-09-01"], {
      onPointClick: (payload: ChartClickPayload) => clicks.push(payload),
    });
    chart.options.chart.events!.dataPointSelection!(null, null, {
      seriesIndex: 0,
      dataPointIndex: 3,
    });
    expect(clicks[0]).toMatchObject({ dataPointIndex: 2, value: 12 });
  });

  it.each([
    ["weekly points", ["2026-09-07", "2026-09-14", "2026-09-21"]],
    ["mid-month dates", ["2026-08-01", "2026-08-15", "2026-09-01"]],
    ["times of day", ["2026-10-01T09:00:00", "2026-10-01T10:00:00"]],
  ])("keeps the datetime axis for %s", async (_, dates) => {
    const chart = await draw(dates);
    expect(chart.options.xaxis.type).toBe("datetime");
    expect(chart.options.xaxis.labels.formatter).toBeUndefined();
  });
});
