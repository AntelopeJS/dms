import type { ChartType } from "./types";

export interface ApexTypeConfig {
  apexType: string;
  isCircular: boolean;
  defaultStroke: { curve?: string; width?: number; dashArray?: number };
  supportsDataLabels: boolean;
  sharedTooltip: boolean;
}

const SMOOTH_LINE_STROKE = { curve: "smooth", width: 3 } as const;
const SMOOTH_BAND_STROKE = { curve: "smooth", width: 1 } as const;
const NO_STROKE = { width: 0 } as const;
const THIN_STROKE = { width: 2 } as const;
const MEDIUM_STROKE = { width: 1 } as const;

export const APEX_TYPE_CONFIGS: Record<ChartType, ApexTypeConfig> = {
  line: {
    apexType: "line",
    isCircular: false,
    defaultStroke: SMOOTH_LINE_STROKE,
    supportsDataLabels: false,
    sharedTooltip: true,
  },
  area: {
    apexType: "area",
    isCircular: false,
    defaultStroke: SMOOTH_LINE_STROKE,
    supportsDataLabels: false,
    sharedTooltip: true,
  },
  rangeArea: {
    apexType: "rangeArea",
    isCircular: false,
    defaultStroke: SMOOTH_BAND_STROKE,
    supportsDataLabels: false,
    sharedTooltip: true,
  },
  bar: {
    apexType: "bar",
    isCircular: false,
    defaultStroke: NO_STROKE,
    supportsDataLabels: false,
    sharedTooltip: false,
  },
  column: {
    apexType: "bar",
    isCircular: false,
    defaultStroke: NO_STROKE,
    supportsDataLabels: false,
    sharedTooltip: false,
  },
  scatter: {
    apexType: "scatter",
    isCircular: false,
    defaultStroke: NO_STROKE,
    supportsDataLabels: false,
    sharedTooltip: false,
  },
  donut: {
    apexType: "donut",
    isCircular: true,
    defaultStroke: THIN_STROKE,
    supportsDataLabels: true,
    sharedTooltip: false,
  },
  pie: {
    apexType: "pie",
    isCircular: true,
    defaultStroke: THIN_STROKE,
    supportsDataLabels: true,
    sharedTooltip: false,
  },
  mixed: {
    apexType: "line",
    isCircular: false,
    defaultStroke: SMOOTH_LINE_STROKE,
    supportsDataLabels: false,
    sharedTooltip: true,
  },
  radar: {
    apexType: "radar",
    isCircular: false,
    defaultStroke: THIN_STROKE,
    supportsDataLabels: false,
    sharedTooltip: true,
  },
  radialBar: {
    apexType: "radialBar",
    isCircular: true,
    defaultStroke: NO_STROKE,
    supportsDataLabels: false,
    sharedTooltip: false,
  },
  heatmap: {
    apexType: "heatmap",
    isCircular: false,
    defaultStroke: NO_STROKE,
    supportsDataLabels: false,
    sharedTooltip: false,
  },
  candlestick: {
    apexType: "candlestick",
    isCircular: false,
    defaultStroke: MEDIUM_STROKE,
    supportsDataLabels: false,
    sharedTooltip: false,
  },
};
