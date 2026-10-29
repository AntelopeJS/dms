import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ChartXAxis as ServerXAxis,
  LineChartProps,
} from "@antelopejs/interface-dms/base/chart";
import { reactive } from "vue";
import { sectionIn } from "./fixtures/axisCallbacks";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";
import type {
  ChartAnnotation,
  ChartSeries,
  ChartXAxis,
} from "../layers/dms-ui/app/composables/chart/types";
import type { ApexOptions } from "apexcharts";

const SERIES: ChartSeries[] = [
  { name: "p50 – p99", data: [{ x: "10:00", y: [12, 48] }] },
];

describe("typed X axis", () => {
  it("keeps the server settings serializable and the formatter Vue-only", () => {
    expectTypeOf<ChartXAxis>().toEqualTypeOf<ServerXAxis>();
    expectTypeOf<LineChartProps>().not.toHaveProperty("xAxisFormatter");
    const settings: ServerXAxis = {
      tickAmount: 2,
      rotate: 0,
      hideOverlappingLabels: true,
      datetimeFormat: "dd MMM",
    };
    expect(JSON.parse(JSON.stringify(settings))).toEqual(settings);
  });

  it("preserves defaults when settings are absent or empty", () => {
    const baseline = sectionIn(optionsFor({}), "xaxis");
    expect(sectionIn(optionsFor({ xAxis: {} }), "xaxis")).toEqual(baseline);
    expect(baseline.type).toBe("category");
    expect(baseline.tickAmount).toBeUndefined();
    expect(sectionIn(baseline, "labels").datetimeUTC).toBe(false);
  });

  it("keeps theme labels and explicit zero/false settings", () => {
    const axis = sectionIn(
      optionsFor({
        xAxis: {
          tickAmount: 2,
          rotate: 0,
          hideOverlappingLabels: false,
        },
      }),
      "xaxis",
    );
    expect(axis.tickAmount).toBe(2);
    expect(sectionIn(axis, "labels")).toMatchObject({
      rotate: 0,
      hideOverlappingLabels: false,
      style: { fontSize: "11px" },
    });
    expect(axis.axisBorder).toEqual({ show: false });
  });

  it.each(["category", "numeric", "datetime"] as const)(
    "formats %s at runtime",
    (xaxisType) => {
      const formatter = (value: string, timestamp?: number) =>
        `${timestamp ?? value} units`;
      const axis = sectionIn(
        optionsFor({
          xaxisType,
          xAxis: { datetimeFormat: "dd MMM" },
          xAxisFormatter: formatter,
        }),
        "xaxis",
      );
      const labels = sectionIn(axis, "labels");
      expect(labels.formatter).toBe(formatter);
      expect(labels.format).toBe(
        xaxisType === "datetime" ? "dd MMM" : undefined,
      );
      expect(formatter("16")).toBe("16 units");
      expect(formatter("date", 123)).toBe("123 units");
    },
  );

  it("keeps rawOptions as the final whole-section override", () => {
    const rawAxis = { type: "numeric", tickAmount: 7 };
    expect(
      sectionIn(
        optionsFor({
          xAxis: { tickAmount: 2 },
          xAxisFormatter: (value) => `Day ${value}`,
          rawOptions: [{ key: "xaxis", value: JSON.stringify(rawAxis) }],
        }),
        "xaxis",
      ),
    ).toEqual(rawAxis);
  });

  it("updates and removes settings and formatters reactively", () => {
    const input = reactive<UseApexChartInput>({
      type: "line",
      series: SERIES,
      xAxis: { tickAmount: 2 },
      xAxisFormatter: (value) => `Jour ${value}`,
    });
    const chart = useApexChart(() => input);
    expect(sectionIn(chart.options.value, "xaxis").tickAmount).toBe(2);
    input.xAxis = { tickAmount: 4 };
    expect(sectionIn(chart.options.value, "xaxis").tickAmount).toBe(4);
    input.xAxis = undefined;
    input.xAxisFormatter = undefined;
    expect(sectionIn(chart.options.value, "xaxis").tickAmount).toBeUndefined();
    expect(
      sectionIn(sectionIn(chart.options.value, "xaxis"), "labels").formatter,
    ).toBeUndefined();
  });
});

function optionsFor(input: Partial<UseApexChartInput>) {
  const chart = useApexChart(() => ({
    type: "line",
    series: SERIES,
    ...input,
  }));
  return chart.options.value;
}

describe("rangeArea", () => {
  it("maps to the Apex rangeArea type", () => {
    const chart = useApexChart(() => ({ type: "rangeArea", series: SERIES }));
    expect(chart.apexType.value).toBe("rangeArea");
  });

  it("fills the band with a flat opacity", () => {
    const fill = sectionIn(optionsFor({ type: "rangeArea" }), "fill");
    expect(fill.opacity).toBeGreaterThan(0);
    expect(fill.type).toBeUndefined();
  });

  it("honours an explicit fillOpacity", () => {
    const fill = sectionIn(
      optionsFor({ type: "rangeArea", fillOpacity: 0.5 }),
      "fill",
    );
    expect(fill.opacity).toBe(0.5);
  });

  it("promotes a mixed chart carrying a band to the rangeArea type", () => {
    const chart = useApexChart(() => ({
      type: "mixed",
      series: SERIES,
      seriesDefs: [
        { name: "p50 – p99", type: "rangeArea" },
        { name: "p95", type: "line" },
      ],
    }));
    expect(chart.apexType.value).toBe("rangeArea");
    const config = sectionIn(chart.options.value, "chart");
    expect(config.type).toBe("rangeArea");
  });

  it("keeps a band-free mixed chart on the line type", () => {
    const chart = useApexChart(() => ({
      type: "mixed",
      series: SERIES,
      seriesDefs: [{ name: "orders", type: "column" }],
    }));
    expect(chart.apexType.value).toBe("line");
  });
});

describe("curve", () => {
  it("defaults to the type's own curve", () => {
    expect(sectionIn(optionsFor({}), "stroke").curve).toBe("smooth");
  });

  it("applies stepline", () => {
    expect(sectionIn(optionsFor({ curve: "stepline" }), "stroke").curve).toBe(
      "stepline",
    );
  });

  it("takes precedence over smooth", () => {
    const stroke = sectionIn(
      optionsFor({ curve: "stepline", smooth: false }),
      "stroke",
    );
    expect(stroke.curve).toBe("stepline");
  });

  it("still lets smooth false fall back to straight", () => {
    expect(sectionIn(optionsFor({ smooth: false }), "stroke").curve).toBe(
      "straight",
    );
  });
});

describe("annotations", () => {
  const CAP: ChartAnnotation = { y: 250, label: "spend cap", color: "#f59e0b" };

  it("stays absent when none are declared", () => {
    expect(optionsFor({}).annotations).toBeUndefined();
    expect(optionsFor({ annotations: [] }).annotations).toBeUndefined();
  });

  it("maps a reference line onto the Y axis", () => {
    const annotations = sectionIn(
      optionsFor({ annotations: [CAP] }),
      "annotations",
    );
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Raw option output is unchecked; using the Apex annotation owner retains its fields without claiming runtime validation.
    const [line] = annotations.yaxis as NonNullable<
      NonNullable<ApexOptions["annotations"]>["yaxis"]
    >;
    expect(line!.y).toBe(250);
    expect(line!.borderColor).toBe("#f59e0b");
    expect(line!.strokeDashArray).toBeGreaterThan(0);
    expect(line!.label!.text).toBe("spend cap");
  });

  it("draws a solid line when dashed is false", () => {
    const annotations = sectionIn(
      optionsFor({ annotations: [{ ...CAP, dashed: false }] }),
      "annotations",
    );
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Raw option output is unchecked; the Apex annotation owner preserves the fields under test.
    const [line] = annotations.yaxis as NonNullable<
      NonNullable<ApexOptions["annotations"]>["yaxis"]
    >;
    expect(line!.strokeDashArray).toBe(0);
  });

  it("resolves theme color names to usable CSS colors", () => {
    const annotations = sectionIn(
      optionsFor({ annotations: [{ y: 4, label: "cap", color: "warning" }] }),
      "annotations",
    );
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Raw option output is unchecked; the Apex annotation owner preserves the fields under test.
    const [line] = annotations.yaxis as NonNullable<
      NonNullable<ApexOptions["annotations"]>["yaxis"]
    >;
    expect(line!.borderColor).not.toBe("warning");
    expect(String(line!.borderColor)).toMatch(/^(#|rgb|hsl)/);
    expect(line!.label!.style).toMatchObject({
      color: line!.borderColor,
    });
  });

  it("shades a band when y2 is set", () => {
    const annotations = sectionIn(
      optionsFor({ annotations: [{ y: 10, y2: 40, color: "#10b981" }] }),
      "annotations",
    );
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Raw option output is unchecked; the Apex annotation owner preserves the fields under test.
    const [band] = annotations.yaxis as NonNullable<
      NonNullable<ApexOptions["annotations"]>["yaxis"]
    >;
    expect(band!.y2).toBe(40);
    expect(band!.fillColor).toBe("#10b981");
    expect(band!.opacity).toBeGreaterThan(0);
    expect(band!.label).toBeUndefined();
  });
});

describe("syncGroup", () => {
  it("leaves the chart ungrouped by default", () => {
    const chart = sectionIn(optionsFor({}), "chart");
    expect(chart.group).toBeUndefined();
    expect(chart.id).toBeUndefined();
  });

  it("exposes the group and a per-chart id", () => {
    const chart = sectionIn(
      optionsFor({ syncGroup: "service-metrics", chartId: "latency" }),
      "chart",
    );
    expect(chart.group).toBe("service-metrics");
    expect(chart.id).toBe("latency");
  });

  it("leaves the id to Apex when no chart id is given", () => {
    const chart = sectionIn(optionsFor({ syncGroup: "grid" }), "chart");
    expect(chart.group).toBe("grid");
    expect(chart.id).toBeUndefined();
  });
});
