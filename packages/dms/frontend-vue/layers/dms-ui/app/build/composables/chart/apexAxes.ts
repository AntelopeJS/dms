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
const SELF_THINNED_XAXIS_TYPES: ChartType[] = ["heatmap"];

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

function thinsOwnXLabels(input: UseApexChartInput): boolean {
  const settings = input.xAxis;
  return (
    SELF_THINNED_XAXIS_TYPES.includes(input.type) &&
    (input.xaxisType ?? "category") === "category" &&
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
