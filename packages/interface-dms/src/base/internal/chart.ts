import { ChartType } from "../chart-type";

/**
 * Palette metadata for one chart type.
 *
 * @internal
 */
export interface ChartTypeMeta {
  name: string;
  icon: string;
}

/**
 * Palette name and icon for each chart type.
 *
 * @internal
 */
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

/**
 * The frontend component every chart factory emits.
 *
 * @internal
 */
export const CHART_COMPONENT_NAME = "dms-chart";
