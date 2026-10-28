import { isNumber } from "../../../../dms-core/app/utils/type-check";
import type { ChartSeries, ChartSeriesPoint, DonutRecord } from "./types";

type ChartSeriesEntry = ChartSeries["data"][number];

function toDonutRecord(entry: ChartSeriesEntry): DonutRecord {
  if (isNumber(entry)) {
    return { label: String(entry), value: entry };
  }
  const point: typeof entry & Pick<ChartSeriesPoint, "label"> = entry;
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
