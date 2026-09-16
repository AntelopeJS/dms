import type { ChartType } from "./types";

export const CHART_EVENT_NAMES = {
  segmentClick: "DmsComponent.Chart.SegmentClick",
  pointClick: "DmsComponent.Chart.PointClick",
} as const;

const SEGMENT_CHART_TYPES = new Set<ChartType>(["donut", "pie", "radialBar"]);

export function isSegmentChart(type: ChartType): boolean {
  return SEGMENT_CHART_TYPES.has(type);
}

export interface ChartClickPayload {
  dataPointIndex: number;
  seriesIndex: number;
  /** Null on the types whose points hold a tuple rather than a scalar. */
  value: number | null;
  /** The point's tuple on those types: `[low, high]`, `[o, h, l, c]`. */
  values?: number[];
  seriesName: string;
  label?: string;
}

export interface ClickPointValue {
  value: number | null;
  values?: number[];
}

interface PointWithY {
  y?: unknown;
}

/**
 * Projects a series point onto the click payload's value fields: scalars
 * land in `value`, tuple points (rangeArea, candlestick) leave `value` null
 * and carry their tuple in `values`.
 */
export function readPointValue(point: unknown): ClickPointValue {
  if (typeof point === "number") return { value: point };
  const y = (point as PointWithY | undefined)?.y;
  if (Array.isArray(y)) return { value: null, values: y as number[] };
  return { value: typeof y === "number" ? y : null };
}
