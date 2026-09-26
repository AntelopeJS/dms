import type { ChartSeries, DonutRecord } from "./types";

type ChartSeriesEntry = ChartSeries["data"][number];

interface LabelledPoint {
  label?: string;
  x?: unknown;
  y?: unknown;
}

function toDonutRecord(entry: ChartSeriesEntry): DonutRecord {
  if (typeof entry === "number") {
    return { label: String(entry), value: entry };
  }
  const point = entry as LabelledPoint;
  return {
    label: point.label ?? String(point.x ?? ""),
    value: Number(point.y ?? 0),
  };
}

/** Turns one chart series into the slices of a circular chart. */
export function toDonutRecords(series: ChartSeries | undefined): DonutRecord[] {
  if (!series || !Array.isArray(series.data)) return [];
  return series.data.map(toDonutRecord);
}
