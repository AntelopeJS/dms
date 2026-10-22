import type { ComputedRef } from "vue";
import type {
  ChartAnnotation,
  ChartAutoYRange,
  ChartCurve,
  ChartLegendPosition,
  ChartSeries,
  ChartType,
  ChartXAxis,
  ChartXAxisFormatter,
  ComparisonStyle,
  DonutRecord,
} from "./types";

export interface MixedSeriesDef {
  name: string;
  type: "line" | "area" | "column" | "rangeArea";
  color?: string;
}

export interface ApexClickOpts {
  dataPointIndex: number;
  seriesIndex: number;
}

export type ApexClickHandler = (
  event: unknown,
  ctx: unknown,
  opts: ApexClickOpts,
) => void;

export interface UseApexChartInput {
  type: ChartType;
  title?: string;
  height?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  legendPosition?: ChartLegendPosition;
  smooth?: boolean;
  curve?: ChartCurve;
  stacked?: boolean;
  annotations?: ChartAnnotation[];
  autoYRange?: ChartAutoYRange;
  syncGroup?: string;
  chartId?: string;
  comparisonStyle?: ComparisonStyle;
  comparisonSeriesCount?: number;
  series: ChartSeries[];
  donutData?: DonutRecord[];
  colors?: string[] | string;
  rawOptions?: Array<{ key: string; value: string }>;
  themeRevision?: number;
  yRange?: { min: number; max: number };
  strokeWidth?: number;
  fillOpacity?: number;
  barWidth?: number;
  columnWidth?: number;
  roundedCorners?: boolean;
  orientation?: "horizontal" | "vertical";
  centralLabel?: string;
  centralSubLabel?: string;
  arcWidth?: number;
  hollowSize?: string;
  showTotal?: boolean;
  shadeIntensity?: number;
  distributed?: boolean;
  seriesDefs?: MixedSeriesDef[];
  pointSize?: number;
  showLabels?: boolean;
  xaxisType?: "category" | "datetime" | "numeric";
  xAxis?: ChartXAxis;
  xAxisFormatter?: ChartXAxisFormatter;
  yAxisFormatter?: (value: number) => string;
  /** The reader's locale, for the dates the chart writes itself. */
  locale?: string;
  onDataPointClick?: ApexClickHandler;
}

export interface UseApexChartOutput {
  apexType: ComputedRef<string>;
  options: ComputedRef<Record<string, unknown>>;
  series: ComputedRef<unknown>;
  /**
   * The index, in the series as given, of the point Apex drew at
   * `dataPointIndex` (they differ when the chart lays dates out in buckets).
   */
  sourcePointIndex: (seriesIndex: number, dataPointIndex: number) => number;
}
