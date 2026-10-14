import type { ApexTypeConfig } from "../../../composables/chart/apexTypeConfigs";
import type { ChartSeries, ChartType } from "../../../composables/chart/types";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";
import {
  readThemeBorder,
  readThemeDimmed,
  readThemeMonoFont,
  readThemeSurface,
} from "../../../composables/chart/useChartTheme";

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
/** Grows a visible point on hover instead of setting a size below its own. */
const HOVER_POINT_SIZE_OFFSET = 2;
/** A scatter is nothing but its points, so it draws them without `pointSize`. */
const DEFAULT_POINT_SIZE = 6;
const POINT_MARKER_TYPES: ChartType[] = ["scatter"];
/** Half a data label's box and a gap: lifts the label off the point it names. */
const POINT_LABEL_CLEARANCE = 11;
const HALF = 2;
const HEAD_MARKER_SIZE = 5;
const SOLID_GRID = 0;
const HEAD_MARKER_TYPES: ChartType[] = ["line", "area"];
/** A radar draws its own polygon grid; the cartesian one would cross the card. */
const OWN_GRID_TYPES: ChartType[] = ["radar"];

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
    position: input.legendPosition ?? (isCircular ? "bottom" : "top"),
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
    show:
      !isCircular &&
      !OWN_GRID_TYPES.includes(input.type) &&
      (input.showGrid ?? true),
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
  if (POINT_MARKER_TYPES.includes(input.type)) {
    return {
      size: pointSize(input),
      strokeWidth: 0,
      hover: { sizeOffset: HOVER_POINT_SIZE_OFFSET },
    };
  }
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

function pointSize(input: UseApexChartInput): number {
  return input.pointSize ?? DEFAULT_POINT_SIZE;
}

/**
 * How far a data label moves up: Apex centres it on its point, which hides a
 * scatter's point under its own label.
 */
export function dataLabelOffset(input: UseApexChartInput): number {
  if (!POINT_MARKER_TYPES.includes(input.type)) return 0;
  return -(pointSize(input) / HALF + POINT_LABEL_CLEARANCE);
}

/** Where Apex is drawing a data label. */
interface DataLabelContext {
  seriesIndex: number;
  dataPointIndex: number;
  w: { config: { series: ChartSeries[] } };
}

/** A point's own `label` when it has one, else the value Apex would print. */
function pointLabel(value: unknown, context: DataLabelContext): unknown {
  const point =
    context.w.config.series[context.seriesIndex]?.data[context.dataPointIndex];
  if (typeof point !== "object" || point === null || !("label" in point)) {
    return value;
  }
  return point.label || value;
}

/**
 * Value labels in mono, without Apex's default drop shadow. A circular chart
 * keeps Apex's own percent formatter: its series hold bare numbers.
 */
export function buildDataLabels(
  enabled: boolean,
  theme: ApexThemeColors,
  isCircular = false,
  offsetY = 0,
): Record<string, unknown> {
  return {
    enabled,
    offsetY,
    dropShadow: { enabled: false },
    style: {
      fontSize: DATA_LABEL_FONT_SIZE,
      fontFamily: theme.monoFont,
      fontWeight: DATA_LABEL_FONT_WEIGHT,
    },
    ...(isCircular ? {} : { formatter: pointLabel }),
  };
}
