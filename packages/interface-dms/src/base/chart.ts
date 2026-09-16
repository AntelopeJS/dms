import { ComponentBuilder } from "../component";
import type { PageMetadata } from "../page";
import { RegisterPageTopic } from "../realtime";
import type { AxeOrientation, BaseComponentProps } from "./types";
import type { HttpMethod } from "./types/http";

export namespace ChartEvents {
  export const SEGMENT_CLICK = "DmsComponent.Chart.SegmentClick";
  export const POINT_CLICK = "DmsComponent.Chart.PointClick";
}

export enum ChartType {
  LINE = "line",
  AREA = "area",
  RANGE_AREA = "rangeArea",
  BAR = "bar",
  COLUMN = "column",
  SCATTER = "scatter",
  DONUT = "donut",
  PIE = "pie",
  MIXED = "mixed",
  RADAR = "radar",
  RADIAL_BAR = "radialBar",
  HEATMAP = "heatmap",
  CANDLESTICK = "candlestick",
}

export type ColorName =
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "neutral"
  | "accent";

/** Available steps in the existing Nuxt UI color scales. */
export type ChartColorShade =
  | 50
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900
  | 950;

/** A semantic Nuxt UI scale and shade; accent aliases primary. */
export type ChartColorToken = `${ColorName}-${ChartColorShade}`;

/** A globally defined CSS custom property, bare or wrapped in var(). */
export type ChartCssColor = `--${string}` | `var(--${string})`;

export type ChartColorValue =
  | ColorName
  | ChartColorToken
  | ChartCssColor
  | `#${string}`
  | `rgb${string}`
  | `hsl${string}`;

export type ChartColor = ChartColorValue | ChartColorValue[];

export type ComparisonStyle = "dashed" | "solid" | "dimmed";

/** How a card or chart renders a numeric value. */
export const VALUE_FORMATS = [
  "number",
  "currency",
  "percent",
  "compact",
] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];

/** Fixed fraction digits, or Intl defaults (including native currency digits). Omit to preserve legacy formatting. */
export type ValuePrecision = number | "native";

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface ChartSeriesPoint {
  x: string | number | Date;
  y: number | null;
  label?: string;
}

export interface ChartCandlePoint {
  x: string | number | Date;
  y: [number, number, number, number];
}

export interface ChartRangePoint {
  x: string | number | Date;
  y: [number, number];
}

export interface ChartSeries {
  name: string;
  data: Array<ChartSeriesPoint | ChartCandlePoint | ChartRangePoint | number>;
  type?: ChartType;
  color?: ChartColorValue;
  /** Stroke width in pixels; overrides chart and comparison defaults. */
  strokeWidth?: number;
  /** Dash length in pixels; zero draws a solid stroke. Overrides comparison defaults. */
  strokeDashArray?: number;
}

export type ChartCurve = "smooth" | "straight" | "stepline";

/** Opt-in expansion of native Y bounds to include annotation lines and bands. */
export interface ChartAutoYRange {
  /** Outward fraction of each bound's magnitude (or 1 at zero). Defaults to 0.08. */
  padding?: number;
}

/** Serializable X-axis presentation; functions belong to the Vue component only. */
export interface ChartXAxis {
  /** Requested intervals, not labels; ApexCharts ignores this for datetime axes. */
  tickAmount?: number;
  /** Label rotation in degrees. */
  rotate?: number;
  /** Let ApexCharts suppress overlapping labels. */
  hideOverlappingLabels?: boolean;
  /** ApexCharts datetime tokens, for example "dd MMM"; datetime axes only. */
  datetimeFormat?: string;
}

export interface ChartAnnotation {
  y: number;
  y2?: number;
  label?: string;
  color?: ChartColorValue;
  dashed?: boolean;
}

export interface DonutRecord {
  label: string;
  value: number;
}

interface BaseChartProps extends BaseComponentProps {
  title?: string;
  description?: string;
  color?: ChartColor;
  height?: string;
  width?: number;
  showTooltip?: boolean;
  showLegend?: boolean;
  fetchUrl?: string;
  fetchUrlMethod?: HttpMethod;
  periodScope?: string;
  realtimeTopic?: string | string[];
  rawOptions?: KeyValuePair[];
  rawCss?: KeyValuePair[];
}

/** Fixed bounds for a chart's value axis. */
export interface YRange {
  min: number;
  max: number;
}

interface XYChartProps extends BaseChartProps {
  showGrid?: boolean;
  staticDataset?: ChartSeries[];
  yRange?: YRange;
  /** Includes annotations in native Y bounds; explicit yRange takes precedence. */
  autoYRange?: ChartAutoYRange;
  comparisonStyle?: ComparisonStyle;
  smooth?: boolean;
  /**
   * Line interpolation, honoured by the line, area, rangeArea and mixed
   * types. Takes precedence over `smooth` when both are set.
   */
  curve?: ChartCurve;
  /**
   * Horizontal reference lines drawn on the Y axis — a spend cap, a max
   * bound, a volume capacity. Set `y2` to shade a band instead of a line.
   */
  annotations?: ChartAnnotation[];
  /**
   * Charts sharing a group name share their crosshair and tooltip position,
   * which turns a grid of metrics into one readable timeline.
   */
  syncGroup?: string;
  xaxisType?: "category" | "datetime" | "numeric";
  /** Typed X-axis settings, applied before rawOptions. */
  xAxis?: ChartXAxis;
}

export interface LineChartProps extends XYChartProps {
  type: ChartType.LINE;
  strokeWidth?: number;
}

export interface AreaChartProps extends XYChartProps {
  type: ChartType.AREA;
  fillOpacity?: number;
  stacked?: boolean;
}

export interface RangeAreaChartProps extends XYChartProps {
  type: ChartType.RANGE_AREA;
  fillOpacity?: number;
}

export interface BarChartProps extends XYChartProps {
  type: ChartType.BAR;
  stacked?: boolean;
  barWidth?: number;
  roundedCorners?: boolean;
  orientation?: AxeOrientation;
}

export interface ColumnChartProps extends XYChartProps {
  type: ChartType.COLUMN;
  stacked?: boolean;
  columnWidth?: number;
  roundedCorners?: boolean;
}

export interface ScatterChartProps extends XYChartProps {
  type: ChartType.SCATTER;
  pointSize?: number;
  showLabels?: boolean;
}

export interface MixedChartSeriesDef {
  name: string;
  type:
    | ChartType.LINE
    | ChartType.AREA
    | ChartType.COLUMN
    | ChartType.RANGE_AREA;
  color?: ChartColorValue;
}

export interface MixedChartProps extends XYChartProps {
  type: ChartType.MIXED;
  seriesDefs?: MixedChartSeriesDef[];
}

export interface RadarChartProps extends XYChartProps {
  type: ChartType.RADAR;
  fillOpacity?: number;
}

export interface CandlestickChartProps extends XYChartProps {
  type: ChartType.CANDLESTICK;
}

export interface CircularChartProps extends BaseChartProps {
  staticDataset?: DonutRecord[];
}

export interface DonutChartProps extends CircularChartProps {
  type: ChartType.DONUT;
  centralLabel?: string;
  centralSubLabel?: string;
  arcWidth?: number;
}

export interface PieChartProps extends CircularChartProps {
  type: ChartType.PIE;
}

export interface RadialBarChartProps extends CircularChartProps {
  type: ChartType.RADIAL_BAR;
  hollowSize?: string;
  showTotal?: boolean;
}

export interface HeatmapChartProps extends BaseChartProps {
  type: ChartType.HEATMAP;
  staticDataset?: ChartSeries[];
  shadeIntensity?: number;
  distributed?: boolean;
}

export type AnyChartProps =
  | LineChartProps
  | AreaChartProps
  | RangeAreaChartProps
  | BarChartProps
  | ColumnChartProps
  | ScatterChartProps
  | MixedChartProps
  | RadarChartProps
  | CandlestickChartProps
  | DonutChartProps
  | PieChartProps
  | RadialBarChartProps
  | HeatmapChartProps;

/** Palette metadata for one chart type. */
export interface ChartTypeMeta {
  name: string;
  icon: string;
}

/** Palette name and icon for each chart type. */
export const CHART_META_BY_TYPE: Record<ChartType, ChartTypeMeta> = {
  [ChartType.LINE]: { name: "Line Chart", icon: "i-ph-chart-line" },
  [ChartType.AREA]: { name: "Area Chart", icon: "i-ph-chart-line-up" },
  [ChartType.RANGE_AREA]: {
    name: "Range Area Chart",
    icon: "i-ph-arrows-vertical",
  },
  [ChartType.BAR]: { name: "Bar Chart", icon: "i-ph-chart-bar-horizontal" },
  [ChartType.COLUMN]: { name: "Column Chart", icon: "i-ph-chart-bar" },
  [ChartType.SCATTER]: { name: "Scatter Chart", icon: "i-ph-chart-scatter" },
  [ChartType.DONUT]: { name: "Donut Chart", icon: "i-ph-chart-donut" },
  [ChartType.PIE]: { name: "Pie Chart", icon: "i-ph-chart-pie-slice" },
  [ChartType.MIXED]: { name: "Mixed Chart", icon: "i-ph-chart-line" },
  [ChartType.RADAR]: { name: "Radar Chart", icon: "i-ph-polygon" },
  [ChartType.RADIAL_BAR]: {
    name: "Radial Bar Chart",
    icon: "i-ph-circle-half",
  },
  [ChartType.HEATMAP]: { name: "Heatmap", icon: "i-ph-grid-nine" },
  [ChartType.CANDLESTICK]: { name: "Candlestick Chart", icon: "i-ph-flag" },
};

/** The frontend component every chart factory emits. */
export const CHART_COMPONENT_NAME = "dms-chart";

function normalizeChartTopics(topic: string | string[] | undefined): string[] {
  if (!topic) return [];
  return Array.isArray(topic) ? topic : [topic];
}

function attachChartRealtimeHook<TProps>(
  builder: ComponentBuilder<TProps>,
  topics: string[],
): void {
  if (topics.length === 0) return;
  builder.onCreated((parentPage: PageMetadata) => {
    const parentInfo = parentPage.pageInfo;
    if (!parentInfo) return;
    for (const topic of topics) {
      RegisterPageTopic(parentInfo.fullId, topic);
    }
  });
}

function createChartBuilder<TType extends ChartType>(type: TType) {
  return <TProps extends Extract<AnyChartProps, { type: TType }>>(
    options: Omit<TProps, "type"> | TProps,
  ): ComponentBuilder<TProps> => {
    const meta = CHART_META_BY_TYPE[type];
    const merged = { ...(options as object), type } as TProps;
    const builder = new ComponentBuilder<TProps>(CHART_COMPONENT_NAME)
      .options(merged)
      .meta({
        name: (merged as BaseChartProps).title || meta.name,
        icon: meta.icon,
      });
    attachChartRealtimeHook(
      builder,
      normalizeChartTopics((merged as BaseChartProps).realtimeTopic),
    );
    return builder;
  };
}

export const ChartLine = createChartBuilder(ChartType.LINE);
export const ChartArea = createChartBuilder(ChartType.AREA);
export const ChartRangeArea = createChartBuilder(ChartType.RANGE_AREA);
export const ChartBar = createChartBuilder(ChartType.BAR);
export const ChartColumn = createChartBuilder(ChartType.COLUMN);
export const ChartScatter = createChartBuilder(ChartType.SCATTER);
export const ChartDonut = createChartBuilder(ChartType.DONUT);
export const ChartPie = createChartBuilder(ChartType.PIE);
export const ChartMixed = createChartBuilder(ChartType.MIXED);
export const ChartRadar = createChartBuilder(ChartType.RADAR);
export const ChartRadialBar = createChartBuilder(ChartType.RADIAL_BAR);
export const ChartHeatmap = createChartBuilder(ChartType.HEATMAP);
export const ChartCandlestick = createChartBuilder(ChartType.CANDLESTICK);
