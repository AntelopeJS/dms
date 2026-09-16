import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { ChartSeries } from "../layers/dms-ui/app/composables/chart/types";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";

const PLAIN: ChartSeries = { name: "Actual", data: [1, 2, 3] };
const STYLED: ChartSeries = {
  name: "Estimate",
  data: [2, 3, 4],
  strokeWidth: 2,
  strokeDashArray: 6,
};

function strokeFor(input: Partial<UseApexChartInput> = {}) {
  return useApexChart(() => ({ type: "line", series: [PLAIN], ...input }))
    .options.value.stroke;
}

describe("series stroke styles", () => {
  it("preserves scalar defaults and comparison defaults when omitted", () => {
    expect(strokeFor()).toEqual({
      curve: "smooth",
      width: 3,
      lineCap: "round",
    });
    expect(
      strokeFor({ series: [PLAIN, PLAIN], comparisonSeriesCount: 1 }),
    ).toMatchObject({ width: [3, 1.5], dashArray: [0, 4] });
  });

  it("keeps styles attached through reactive reorder, insertion and removal", () => {
    const series = ref([PLAIN, STYLED]);
    const chart = useApexChart(() => ({ type: "line", series: series.value }));
    expect(chart.options.value.stroke).toMatchObject({
      width: [3, 2],
      dashArray: [0, 6],
    });
    series.value = [STYLED, PLAIN];
    expect(chart.options.value.stroke).toMatchObject({
      width: [2, 3],
      dashArray: [6, 0],
    });
    series.value = [PLAIN, STYLED, PLAIN];
    expect(chart.options.value.stroke).toMatchObject({
      width: [3, 2, 3],
      dashArray: [0, 6, 0],
    });
    series.value = [STYLED];
    expect(chart.options.value.stroke).toMatchObject({
      width: [2],
      dashArray: [6],
    });
    series.value = [PLAIN];
    expect(chart.options.value.stroke).toEqual(strokeFor());
    series.value = [];
    expect(chart.options.value.stroke).toEqual(strokeFor());
  });

  it("overrides global width and comparison styling, including explicit zero", () => {
    const solid: ChartSeries = { ...PLAIN, strokeWidth: 0, strokeDashArray: 0 };
    expect(
      strokeFor({
        series: [STYLED, solid],
        strokeWidth: 8,
        comparisonSeriesCount: 1,
      }),
    ).toMatchObject({ width: [2, 0], dashArray: [6, 0] });
    expect(
      strokeFor({
        series: [STYLED, PLAIN],
        strokeWidth: 8,
        comparisonSeriesCount: 1,
      }),
    ).toMatchObject({ width: [2, 8], dashArray: [6, 4] });
  });

  it.each(["solid", "dimmed"] as const)(
    "overrides %s comparison dashes",
    (comparisonStyle) => {
      expect(
        strokeFor({
          series: [PLAIN, STYLED],
          comparisonSeriesCount: 1,
          comparisonStyle,
        }),
      ).toMatchObject({ width: [3, 2], dashArray: [0, 6] });
    },
  );

  it("resolves each property independently", () => {
    expect(
      strokeFor({
        series: [
          { ...PLAIN, strokeWidth: 5 },
          { ...PLAIN, strokeDashArray: 3 },
        ],
      }),
    ).toMatchObject({ width: [5, 3], dashArray: [0, 3] });
  });

  it("preserves styles when mixed definitions project type and color", () => {
    const chart = useApexChart(() => ({
      type: "mixed",
      series: [PLAIN, STYLED],
      comparisonSeriesCount: 1,
      seriesDefs: [
        { name: "Actual", type: "column" },
        { name: "Estimate", type: "line", color: "#ff0000" },
      ],
    }));
    expect(chart.options.value.stroke).toMatchObject({
      width: [3, 2],
      dashArray: [0, 6],
    });
    expect(chart.series.value).toEqual([
      { ...PLAIN, type: "column" },
      { ...STYLED, type: "line", color: "#ff0000" },
    ]);
  });

  it("keeps rawOptions as whole-section replacement, not a deep merge", () => {
    const rawStroke = { width: [9], dashArray: [1] };
    expect(
      strokeFor({
        series: [STYLED],
        rawOptions: [{ key: "stroke", value: JSON.stringify(rawStroke) }],
      }),
    ).toEqual(rawStroke);
  });
});
