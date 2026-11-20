import { describe, expect, it } from "vitest";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";
import { isFunction } from "../layers/dms-core/app/utils/type-check";
import { sectionIn } from "./fixtures/axisCallbacks";

const WEEK = Date.UTC(2026, 8, 7);
const euros = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(
    value,
  );

function labelFormatter(
  orientation: UseApexChartInput["orientation"],
  axis: "xaxis" | "yaxis",
): ((value: number) => string) | undefined {
  const options = useApexChart(() => ({
    type: "bar",
    orientation,
    xaxisType: "datetime",
    locale: "en-US",
    yAxisFormatter: euros,
    series: [{ name: "Revenue", data: [{ x: WEEK, y: 1788 }] }],
  })).options.value;
  const labels = sectionIn(sectionIn(options, axis), "labels");
  const formatter = labels.formatter;
  if (formatter === undefined) return undefined;
  if (!isFunction(formatter))
    throw new Error(`${axis} formatter is not a function`);
  return (value) => String(formatter(value));
}

describe("a bar chart with datetime categories and a currency valueFormat", () => {
  it("writes dates on the category axis and euros on the values of a horizontal bar", () => {
    expect(labelFormatter("horizontal", "yaxis")!(WEEK)).toBe("Sep 7, 2026");
    expect(labelFormatter("horizontal", "xaxis")!(1788)).toBe("€1,788.00");
  });

  it("writes euros on the values and no currency on the dates of a vertical bar", () => {
    expect(labelFormatter("vertical", "yaxis")!(1788)).toBe("€1,788.00");
    expect(labelFormatter("vertical", "xaxis")).toBeUndefined();
  });
});
