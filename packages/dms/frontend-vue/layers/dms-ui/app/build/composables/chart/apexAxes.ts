import type { ApexOptions } from "apexcharts";
import { axisLabelStyle, type ApexThemeColors } from "./apexTheme";
import {
  buildAutoYRange,
  formatPlainAxisValue,
} from "../../../composables/chart/apexYRange";
import { thinnedCategoryFormatter } from "../../../composables/chart/apexCategoryLabels";
import type { ChartType } from "../../../composables/chart/types";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";
import {
  readThemeBorderAccented,
  readThemeHighlighted,
} from "../../../composables/chart/useChartTheme";

const CROSSHAIR_DASH = 3;
const HIGH_CONTRAST_YAXIS_TYPES: ChartType[] = ["radar"];
const CATEGORY_YAXIS_TYPES: ChartType[] = ["heatmap"];
const SELF_THINNED_XAXIS_TYPES: ChartType[] = [
  "heatmap",
  "line",
  "area",
  "rangeArea",
  "column",
  "bar",
  "mixed",
];

type YAxis = NonNullable<Exclude<ApexOptions["yaxis"], unknown[]>>;
type XAxis = NonNullable<ApexOptions["xaxis"]>;

export function buildYAxis(
  input: UseApexChartInput,
  theme: ApexThemeColors,
): YAxis & { labels: NonNullable<YAxis["labels"]> } {
  const labelColor = HIGH_CONTRAST_YAXIS_TYPES.includes(input.type)
    ? readThemeHighlighted()
    : theme.dimmed;
  const yaxis: ReturnType<typeof buildYAxis> = {
    ...buildAutoYRange(input),
    labels: { style: axisLabelStyle(labelColor, theme) },
  };
  if (input.yRange) {
    yaxis.min = input.yRange.min;
    yaxis.max = input.yRange.max;
  }
  const valueFormatter = CATEGORY_YAXIS_TYPES.includes(input.type)
    ? undefined
    : input.yAxisFormatter;
  yaxis.labels.formatter = valueFormatter ?? formatPlainAxisValue;
  return yaxis;
}

/**
 * Whether the chart draws a category x-axis whose labels this module thins.
 * A horizontal bar puts its categories on the other axis. `bucketed` marks a
 * datetime series Apex draws as a category axis of bucket labels.
 */
export function thinsOwnXLabels(
  input: UseApexChartInput,
  bucketed = false,
): boolean {
  const settings = input.xAxis;
  const horizontalBar =
    input.type === "bar" && input.orientation !== "vertical";
  return (
    SELF_THINNED_XAXIS_TYPES.includes(input.type) &&
    !horizontalBar &&
    (bucketed || (input.xaxisType ?? "category") === "category") &&
    settings?.hideOverlappingLabels !== false &&
    settings?.tickAmount === undefined &&
    !settings?.rotate
  );
}

function xLabelFormatter(input: UseApexChartInput) {
  if (thinsOwnXLabels(input))
    return thinnedCategoryFormatter(input.xAxisFormatter);
  return input.xAxisFormatter;
}

export function buildXAxis(
  input: UseApexChartInput,
  theme: ApexThemeColors,
): XAxis & { labels: NonNullable<XAxis["labels"]> } {
  const settings = input.xAxis;
  const formatter = xLabelFormatter(input);
  const xaxis: ReturnType<typeof buildXAxis> = {
    type: input.xaxisType ?? "category",
    axisBorder: { show: false },
    axisTicks: { show: false },
    tooltip: { enabled: false },
    labels: {
      style: axisLabelStyle(theme.dimmed, theme),
      datetimeUTC: false,
      rotate: settings?.rotate ?? 0,
      hideOverlappingLabels: settings?.hideOverlappingLabels ?? true,
    },
  };
  if (input.xaxisType === "datetime" && settings?.datetimeFormat !== undefined)
    xaxis.labels.format = settings.datetimeFormat;
  if (formatter) xaxis.labels.formatter = formatter;
  xaxis.crosshairs = {
    stroke: { color: readThemeBorderAccented(), dashArray: CROSSHAIR_DASH },
  };
  if (settings?.tickAmount !== undefined)
    xaxis.tickAmount = settings.tickAmount;
  return xaxis;
}
