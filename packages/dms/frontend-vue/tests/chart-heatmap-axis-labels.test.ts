import { describe, expect, it } from "vitest";
import {
  categoryLabelStep,
  thinnedCategoryFormatter,
} from "../layers/dms-ui/app/composables/chart/apexCategoryLabels";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";

type LabelFormatter = ReturnType<typeof thinnedCategoryFormatter>;

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
  // SAFETY: useApexChart creates xaxis.labels for these axis chart fixtures, and any formatter is the thinnedCategoryFormatter callback.
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

  it("leaves a horizontal bar's labels alone", () => {
    expect(heatmapFormatter({ type: "bar" })).toBeUndefined();
    expect(
      heatmapFormatter({ type: "bar", orientation: "vertical" }),
    ).toBeDefined();
  });
});

const DAYS = Array.from({ length: 90 }, (_, day) =>
  new Date(Date.UTC(2026, 7, 4 + day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }),
);
const WIDE_GRID_WIDTH = 1500;

function categoryFormatter(
  labels: string[],
  input: Partial<UseApexChartInput> = {},
): LabelFormatter | undefined {
  const options = useApexChart(() => ({
    type: "line",
    series: [{ name: "A", data: labels.map((x, y) => ({ x, y })) }],
    ...input,
  })).options.value;
  // SAFETY: useApexChart creates xaxis.labels for these axis chart fixtures, and any formatter is the thinnedCategoryFormatter callback.
  return (options.xaxis as { labels: { formatter?: LabelFormatter } }).labels
    .formatter;
}

function drawn(
  formatter: LabelFormatter,
  labels: string[],
  gridWidth: number,
): string[] {
  const w = { globals: { gridWidth, labels } };
  return labels.map((label, i) => formatter(label, undefined, { i, w }));
}

describe("category x-axis labels of a long series", () => {
  it.each(["line", "area", "rangeArea", "column", "mixed"] as const)(
    "thins 90 daily labels on a %s chart",
    (type) => {
      const shown = drawn(
        categoryFormatter(DAYS, { type })!,
        DAYS,
        WIDE_GRID_WIDTH,
      ).filter(Boolean);
      expect(shown.length).toBeGreaterThan(5);
      expect(shown.length).toBeLessThan(DAYS.length / 2);
    },
  );

  it("keeps every label of a short series", () => {
    const six = DAYS.slice(0, 6);
    expect(drawn(categoryFormatter(six)!, six, WIDE_GRID_WIDTH)).toEqual(six);
  });

  it("thins a datetime series drawn as buckets", () => {
    const keys = Array.from({ length: 90 }, (_, day) =>
      new Date(Date.UTC(2026, 7, 4 + day)).toISOString().slice(0, 10),
    );
    const formatter = categoryFormatter(keys, {
      type: "column",
      xaxisType: "datetime",
    })!;
    const shown = drawn(formatter, keys, WIDE_GRID_WIDTH).filter(Boolean);
    expect(shown.length).toBeGreaterThan(5);
    expect(shown.length).toBeLessThan(keys.length / 2);
  });

  it("respects explicit axis settings", () => {
    for (const xAxis of [
      { tickAmount: 6 },
      { rotate: -45 },
      { hideOverlappingLabels: false },
    ])
      expect(categoryFormatter(DAYS, { xAxis })).toBeUndefined();
  });
});
