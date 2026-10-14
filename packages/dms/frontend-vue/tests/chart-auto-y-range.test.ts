import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";

interface AutoBounds {
  min: (value: number) => number;
  max: (value: number) => number;
}

function chartFor(input: Partial<UseApexChartInput> = {}) {
  return useApexChart(() => ({ type: "line", series: [], ...input }));
}

function boundsFor(input: Partial<UseApexChartInput> = {}): AutoBounds {
  return chartFor({ autoYRange: {}, ...input }).options.value
    .yaxis as AutoBounds;
}

describe("annotation-aware auto Y range", () => {
  it("leaves native scaling unchanged unless opted in", () => {
    const yaxis = chartFor({ annotations: [{ y: 200 }] }).options.value.yaxis;
    expect(yaxis).not.toHaveProperty("min");
    expect(yaxis).not.toHaveProperty("max");
  });

  it("keeps explicit bounds authoritative even with annotations and auto range", () => {
    const yaxis = boundsFor({
      yRange: { min: 0, max: 10 },
      annotations: [{ y: 200 }],
    });
    expect(yaxis).toMatchObject({ min: 0, max: 10 });
  });

  it("expands both ends for annotations above and below native data bounds", () => {
    const bounds = boundsFor({ annotations: [{ y: 200 }, { y: -50 }] });
    expect(bounds.min(10)).toBe(-100);
    expect(bounds.max(30)).toBe(250);
  });

  it("includes both ends of a reversed band and all native series extrema", () => {
    const bounds = boundsFor({ annotations: [{ y: 200, y2: -50 }] });
    expect(bounds.min(-100)).toBe(-150);
    expect(bounds.max(300)).toBe(350);
  });

  it("pads negative bounds outwards rather than clipping negative data", () => {
    const bounds = boundsFor();
    expect(bounds.min(-100)).toBe(-120);
    expect(bounds.max(-10)).toBe(-9);
  });

  it("gives zero-only data a nonzero range without changing the series", () => {
    const series = [{ name: "zero", data: [0, 0] }];
    const chart = chartFor({ autoYRange: {}, series });
    const bounds = chart.options.value.yaxis as AutoBounds;
    expect(bounds.min(0)).toBe(-0.08);
    expect(bounds.max(0)).toBe(0.08);
    expect(chart.series.value).toEqual(series);
  });

  it("does not synthesize data for an empty chart", () => {
    expect(
      chartFor({ autoYRange: {}, annotations: [{ y: 20 }] }).series.value,
    ).toEqual([]);
  });

  it("supports zero padding", () => {
    const bounds = boundsFor({
      autoYRange: { padding: 0 },
      annotations: [{ y: 20 }],
    });
    expect(bounds.min(0)).toBe(0);
    expect(bounds.max(10)).toBe(20);
  });

  it.each([-1, NaN, Infinity])("defaults invalid padding %s", (padding) => {
    expect(boundsFor({ autoYRange: { padding } }).max(100)).toBe(120);
  });

  it("ignores nonfinite annotation coordinates when determining bounds", () => {
    const bounds = boundsFor({
      annotations: [{ y: NaN }, { y: Infinity }, { y: 20 }],
    });
    expect(bounds.min(10)).toBe(9);
    expect(bounds.max(10)).toBe(22);
  });

  it("recomputes when annotations or padding change", () => {
    const input = reactive<UseApexChartInput>({
      type: "line",
      series: [],
      autoYRange: { padding: 0.1 },
      annotations: [{ y: 20 }],
    });
    const chart = useApexChart(() => input);
    expect((chart.options.value.yaxis as AutoBounds).max(10)).toBe(22);
    input.annotations![0]!.y = 40;
    input.autoYRange!.padding = 0.2;
    expect((chart.options.value.yaxis as AutoBounds).max(10)).toBe(48);
  });

  it("retains the rawOptions escape hatch precedence", () => {
    expect(
      chartFor({
        autoYRange: {},
        rawOptions: [{ key: "yaxis", value: '{"min":0,"max":5}' }],
      }).options.value.yaxis,
    ).toEqual({ min: 0, max: 5 });
  });

  it("rounds the padded bounds to a step the axis can tick evenly", () => {
    const series = [{ name: "value", data: [104.4, 420, 770] }];
    const bounds = boundsFor({ series, annotations: [{ y: 300, y2: 500 }] });
    expect(bounds.min(104.4)).toBe(0);
    expect(bounds.max(770)).toBe(900);
  });

  it("writes unformatted axis labels without float noise", () => {
    const labels = chartFor().options.value.yaxis as {
      labels: { formatter: (value: number) => string };
    };
    expect(labels.labels.formatter(160.00000000000003)).toBe("160");
    expect(labels.labels.formatter(0.1 + 0.2)).toBe("0.3");
    expect(labels.labels.formatter(603.6)).toBe("603.6");
  });

  it("does not scale circular charts", () => {
    expect(boundsFor({ type: "donut" })).not.toHaveProperty("min");
  });
});
