export interface Point {
  x: string;
  y: number;
}

/**
 * A figure and, only while a comparison period is selected, the one before it
 * and the share it moved: without one the card shows no change at all, not a
 * 0% stand-in (see `ComparedFigure` in interface-dms).
 */
export interface ComparedPayload {
  delta?: number;
  previousValue?: number;
}

export interface ChartCardPayload extends ComparedPayload {
  value: number;
  series: Array<{ name: string; data: Point[] }>;
  comparisonSeries?: Array<{ name: string; data: Point[] }>;
}

export interface KpiCardPayload extends ComparedPayload {
  value: number;
  sparkline: number[];
}

export interface ChartPayload {
  series: Array<{ name: string; data: Point[] }>;
}

export type RangeTuple = [number, number];

interface RangePoint {
  x: string;
  y: RangeTuple;
}

export interface RangeChartPayload {
  series: Array<{ name: string; data: RangePoint[] }>;
}

export interface BandLinePayload {
  series: Array<{ name: string; data: RangePoint[] | Point[] }>;
}

export interface CircularPayload {
  series: Array<{
    name: string;
    data: Array<{ x: string; y: number; label: string }>;
  }>;
}

export interface TopListItemPayload {
  id: string;
  title: string;
  description?: string;
  value: number;
  delta?: number | null;
  sparkline?: number[];
}

export interface TopListPayload {
  items: TopListItemPayload[];
}

export type OhlcTuple = [number, number, number, number];

interface CandlePoint {
  x: string;
  y: OhlcTuple;
}

export interface CandlestickPayload {
  series: Array<{ name: string; data: CandlePoint[] }>;
}
