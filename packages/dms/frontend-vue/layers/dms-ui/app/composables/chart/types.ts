/** Serializable X-axis settings, matching the DMS server contract. */
export interface ChartXAxis {
  /** Requested intervals; ignored by ApexCharts on datetime axes. */
  tickAmount?: number;
  /** Label rotation in degrees. */
  rotate?: number;
  /** Suppress overlapping labels. */
  hideOverlappingLabels?: boolean;
  /** ApexCharts datetime tokens, for example "dd MMM". */
  datetimeFormat?: string;
}

/** Vue-only formatter; timestamp is supplied by ApexCharts for datetime labels. */
export type ChartXAxisFormatter = (value: string, timestamp?: number) => string;

export const CHART_TYPES = [
  "line",
  "area",
  "rangeArea",
  "bar",
  "column",
  "scatter",
  "donut",
  "pie",
  "mixed",
  "radar",
  "radialBar",
  "heatmap",
  "candlestick",
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export const CIRCULAR_CHART_TYPES: ChartType[] = ["donut", "pie", "radialBar"];

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
  color?: string;
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

export interface ChartAnnotation {
  y: number;
  y2?: number;
  label?: string;
  color?: string;
  dashed?: boolean;
}

export interface DonutRecord {
  label: string;
  value: number;
}

export interface ChartCardResponse {
  value: number;
  delta?: number;
  previousValue?: number;
  series: ChartSeries[];
  comparisonSeries?: ChartSeries[];
}

export interface KpiCardResponse {
  value: number;
  delta?: number;
  previousValue?: number;
  sparkline?: number[];
}

export interface TopListItem {
  id: string | number;
  title: string;
  description?: string;
  value: number;
  delta?: number | null;
  sparkline?: number[];
  icon?: string;
  avatar?: { src: string; alt?: string };
  to?: string;
}

export interface TopListCardResponse {
  items: TopListItem[];
}

export interface ChartResponse {
  series: ChartSeries[];
}

export type ValueFormat = "number" | "currency" | "percent" | "compact";

/** Fixed fraction digits, or Intl defaults; omitted preserves legacy formatting. */
export type ValuePrecision = number | "native";

export type ComparisonStyle = "dashed" | "solid" | "dimmed";

export type UiColor =
  | "primary"
  | "secondary"
  | "success"
  | "info"
  | "warning"
  | "error"
  | "neutral";

export const NESTED_CHART_INJECT_KEY = Symbol("DmsChartCardNested");

export interface NestedChartContext {
  cardSeries: ChartSeries[];
  cardComparisonSeries: ChartSeries[];
  isLoading: boolean;
  hideLegend?: boolean;
  valueFormat?: ValueFormat;
  currencyCode?: string;
  valuePrecision?: ValuePrecision;
}
