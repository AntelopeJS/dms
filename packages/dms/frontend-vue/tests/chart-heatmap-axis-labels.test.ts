import { describe, expect, it } from "vitest";
import {
  categoryLabelStep,
  thinnedCategoryFormatter,
} from "../layers/dms-ui/app/composables/chart/apexCategoryLabels";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";

type LabelFormatter = (
  value: string,
  timestamp?: number,
  opts?: { i?: number; w?: unknown },
) => string;

const HOURS = Array.from(
  { length: 24 },
  (_, hour) => `${String(hour).padStart(2, "0")}:00`,
);
const PHONE_GRID_WIDTH = 300;
const DESKTOP_GRID_WIDTH = 1200;

function heatmapFormatter(
  input: Partial<UseApexChartInput> = {},
): LabelFormatter | undefined {
  const options = useApexChart(() => ({
    type: "heatmap",
    series: [{ name: "Mon", data: HOURS.map((x) => ({ x, y: 1 })) }],
    ...input,
  })).options.value;
  const labels = (options.xaxis as { labels: { formatter?: LabelFormatter } })
    .labels;
  return labels.formatter;
}

function drawnLabels(formatter: LabelFormatter, gridWidth: number): string[] {
  const w = { globals: { gridWidth, labels: HOURS } };
  return HOURS.map((hour, i) => formatter(hour, undefined, { i, w }));
}

describe("heatmap x-axis labels", () => {
  it("keeps every label while each fits its column", () => {
    expect(categoryLabelStep(DESKTOP_GRID_WIDTH, 24, 5)).toBe(1);
  });

  it("keeps one label every few columns on a narrow plot", () => {
    const step = categoryLabelStep(PHONE_GRID_WIDTH, 24, 5);
    expect(step).toBeGreaterThan(2);
    const labels = drawnLabels(heatmapFormatter()!, PHONE_GRID_WIDTH);
    labels.forEach((label, i) =>
      expect(label).toBe(i % step === 0 ? HOURS[i] : ""),
    );
  });

  it("draws every hour on a wide plot", () => {
    expect(drawnLabels(heatmapFormatter()!, DESKTOP_GRID_WIDTH)).toEqual(HOURS);
  });

  it("leaves the tooltip's label whole", () => {
    const formatter = heatmapFormatter()!;
    expect(formatter("07:00", undefined, { w: {} })).toBe("07:00");
    expect(formatter("07:00")).toBe("07:00");
  });

  it("thins the card's formatted labels", () => {
    const formatter = thinnedCategoryFormatter((value) => `${value} h`);
    const w = { globals: { gridWidth: PHONE_GRID_WIDTH, labels: HOURS } };
    expect(formatter("00:00", undefined, { i: 0, w })).toBe("00:00 h");
    expect(formatter("01:00", undefined, { i: 1, w })).toBe("");
  });

  it("leaves the labels to explicit axis settings", () => {
    expect(heatmapFormatter({ xAxis: { tickAmount: 6 } })).toBeUndefined();
    expect(heatmapFormatter({ xAxis: { rotate: -45 } })).toBeUndefined();
    expect(
      heatmapFormatter({ xAxis: { hideOverlappingLabels: false } }),
    ).toBeUndefined();
  });

  it("does not touch other charts' labels", () => {
    const options = useApexChart(() => ({
      type: "column",
      series: [{ name: "A", data: [1, 2] }],
    })).options.value;
    expect(
      (options.xaxis as { labels: { formatter?: unknown } }).labels.formatter,
    ).toBeUndefined();
  });
});
