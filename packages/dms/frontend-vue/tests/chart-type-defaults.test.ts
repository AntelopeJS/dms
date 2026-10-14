import { describe, expect, it } from "vitest";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";
import type { ChartSeries } from "../layers/dms-ui/app/composables/chart/types";

const DEALS: ChartSeries[] = [
  {
    name: "Deals",
    data: [
      { x: 3, y: 120, label: "Acme" },
      { x: 8, y: 340 },
    ],
  },
];

type Section = Record<string, unknown>;
type LabelFormatter = (value: unknown, context: unknown) => unknown;

function optionsFor(input: Partial<UseApexChartInput>): Section {
  return useApexChart(() => ({ type: "line", series: [], ...input })).options
    .value;
}

function sectionOf(options: Section, key: string): Section {
  return options[key] as Section;
}

function labelContext(dataPointIndex: number) {
  return { seriesIndex: 0, dataPointIndex, w: { config: { series: DEALS } } };
}

describe("radar grid", () => {
  it("leaves the grid to the radar's own polygons", () => {
    expect(sectionOf(optionsFor({ type: "radar" }), "grid").show).toBe(false);
  });

  it("keeps the cartesian grid on axis charts", () => {
    expect(sectionOf(optionsFor({ type: "line" }), "grid").show).toBe(true);
  });
});

describe("donut slice labels", () => {
  it("hides them on the default thin ring they overflow", () => {
    const labels = sectionOf(optionsFor({ type: "donut" }), "dataLabels");
    expect(labels.enabled).toBe(false);
  });

  it("shows them on a ring wide enough to hold them", () => {
    const labels = sectionOf(
      optionsFor({ type: "donut", arcWidth: 45 }),
      "dataLabels",
    );
    expect(labels.enabled).toBe(true);
  });

  it("keeps them on a pie, and Apex's own percent formatter", () => {
    const labels = sectionOf(optionsFor({ type: "pie" }), "dataLabels");
    expect(labels.enabled).toBe(true);
    expect(labels.formatter).toBeUndefined();
  });
});

describe("scatter points", () => {
  it("draws its points without a pointSize", () => {
    const markers = sectionOf(optionsFor({ type: "scatter" }), "markers");
    expect(markers.size).toBeGreaterThan(0);
  });

  it("honours an explicit pointSize", () => {
    const markers = sectionOf(
      optionsFor({ type: "scatter", pointSize: 9 }),
      "markers",
    );
    expect(markers.size).toBe(9);
  });

  it("keeps line markers hidden", () => {
    expect(sectionOf(optionsFor({ type: "line" }), "markers").size).toBe(0);
  });

  it("labels a point with its own label, else its value", () => {
    const labels = sectionOf(
      optionsFor({ type: "scatter", series: DEALS, showLabels: true }),
      "dataLabels",
    );
    const format = labels.formatter as LabelFormatter;
    expect(format(120, labelContext(0))).toBe("Acme");
    expect(format(340, labelContext(1))).toBe(340);
  });
});

describe("rawOptions paths", () => {
  it("sets a dotted key inside its section", () => {
    const markers = sectionOf(
      optionsFor({
        type: "scatter",
        rawOptions: [{ key: "markers.size", value: "5" }],
      }),
      "markers",
    );
    expect(markers.size).toBe(5);
    expect(markers.strokeWidth).toBe(0);
  });

  it("creates the sections a dotted key names", () => {
    const options = optionsFor({
      rawOptions: [{ key: "states.hover.filter", value: '{"type":"none"}' }],
    });
    expect(options.states).toEqual({ hover: { filter: { type: "none" } } });
  });

  it("still replaces a whole section from a plain key", () => {
    const options = optionsFor({
      rawOptions: [{ key: "markers", value: '{"size":5}' }],
    });
    expect(options.markers).toEqual({ size: 5 });
  });
});
