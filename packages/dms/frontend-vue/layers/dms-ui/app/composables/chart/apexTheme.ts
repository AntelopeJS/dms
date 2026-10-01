import type { ApexTypeConfig } from "./apexTypeConfigs";
import type { ChartSeries, ChartType } from "./types";
import type { UseApexChartInput } from "./useApexChart.types";
import {
  readThemeBorder,
  readThemeDimmed,
  readThemeMonoFont,
  readThemeSurface,
} from "./useChartTheme";

const GRID_PADDING = { left: 8, right: 8, top: 0, bottom: 0 };
const AXIS_LABEL_FONT_SIZE = "11px";
const AXIS_LABEL_FONT_WEIGHT = 500;
const LEGEND_FONT_SIZE = "12px";
const LEGEND_MARKER_SIZE = 4;
const LEGEND_ITEM_GAP = 8;
const DATA_LABEL_FONT_SIZE = "11px";
const DATA_LABEL_FONT_WEIGHT = 600;
const TOOLTIP_DATETIME_FORMAT = "dd MMM yyyy";
const HOVER_MARKER_SIZE = 5;
const HEAD_MARKER_SIZE = 5;
const SOLID_GRID = 0;
const HEAD_MARKER_TYPES: ChartType[] = ["line", "area"];

/** Theme colors every section of an Apex config reads once per build. */
export interface ApexThemeColors {
  muted: string;
  dimmed: string;
  border: string;
  surface: string;
  monoFont: string;
}

/** Resolve the theme colors for one options build. */
export function readApexThemeColors(muted: string): ApexThemeColors {
  return {
    muted,
    dimmed: readThemeDimmed(),
    border: readThemeBorder(),
    surface: readThemeSurface(),
    monoFont: readThemeMonoFont(),
  };
}

/** Axis label style (v2: Geist Mono 11px in the dimmed text tier). */
export function axisLabelStyle(
  color: string,
  theme: ApexThemeColors,
): Record<string, unknown> {
  return {
    colors: color,
    fontSize: AXIS_LABEL_FONT_SIZE,
    fontFamily: theme.monoFont,
    fontWeight: AXIS_LABEL_FONT_WEIGHT,
  };
}

/** Legend with small square keys; the rounding comes from the host CSS. */
export function buildLegend(
  input: UseApexChartInput,
  isCircular: boolean,
  theme: ApexThemeColors,
): Record<string, unknown> {
  return {
    show: input.showLegend ?? true,
    position: isCircular ? "bottom" : "top",
    horizontalAlign: "right",
    fontSize: LEGEND_FONT_SIZE,
    labels: { colors: theme.muted },
    markers: {
      size: LEGEND_MARKER_SIZE,
      shape: "square",
      strokeWidth: 0,
    },
    itemMargin: { horizontal: LEGEND_ITEM_GAP },
  };
}

/** Horizontal, solid grid lines only (v2 `showGrid`). */
export function buildGrid(
  input: UseApexChartInput,
  isCircular: boolean,
  theme: ApexThemeColors,
): Record<string, unknown> {
  return {
    show: !isCircular && (input.showGrid ?? true),
    borderColor: theme.border,
    strokeDashArray: SOLID_GRID,
    padding: GRID_PADDING,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
  };
}

/** Tooltip behaviour; ApexChartHost's stylesheet paints it as a v2 menu. */
export function buildTooltip(
  input: UseApexChartInput,
  config: ApexTypeConfig,
): Record<string, unknown> {
  const tooltip: Record<string, unknown> = {
    enabled: input.showTooltip ?? true,
    shared: config.sharedTooltip,
    intersect: !config.sharedTooltip,
    marker: { show: true },
  };
  if (input.xaxisType === "datetime") {
    tooltip.x = { format: TOOLTIP_DATETIME_FORMAT };
  }
  if (input.yAxisFormatter) {
    tooltip.y = { formatter: input.yAxisFormatter };
  }
  return tooltip;
}

function headMarker(
  series: ChartSeries[],
  color: string | undefined,
  theme: ApexThemeColors,
): Record<string, unknown>[] {
  const lastIndex = (series[0]?.data.length ?? 0) - 1;
  if (lastIndex < 0 || !color) return [];
  return [
    {
      seriesIndex: 0,
      dataPointIndex: lastIndex,
      fillColor: color,
      strokeColor: theme.surface,
      size: HEAD_MARKER_SIZE,
    },
  ];
}

/**
 * Markers stay hidden except the head of the main line, so the latest value
 * reads at a glance.
 */
export function buildMarkers(
  input: UseApexChartInput,
  series: ChartSeries[],
  colors: string[],
  theme: ApexThemeColors,
): Record<string, unknown> {
  const showsHead = HEAD_MARKER_TYPES.includes(input.type) && !input.stacked;
  return {
    size: 0,
    // A discrete marker makes Apex draw every point: any stroke would show
    // as a bump on the line, so markers carry none.
    strokeWidth: 0,
    hover: { size: HOVER_MARKER_SIZE },
    discrete: showsHead ? headMarker(series, colors[0], theme) : [],
  };
}

/** Value labels in mono, without Apex's default drop shadow. */
export function buildDataLabels(
  enabled: boolean,
  theme: ApexThemeColors,
): Record<string, unknown> {
  return {
    enabled,
    dropShadow: { enabled: false },
    style: {
      fontSize: DATA_LABEL_FONT_SIZE,
      fontFamily: theme.monoFont,
      fontWeight: DATA_LABEL_FONT_WEIGHT,
    },
  };
}
