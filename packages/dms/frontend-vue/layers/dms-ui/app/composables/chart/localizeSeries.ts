import type { ChartSeries, DonutRecord } from "./types";

/** Writes one display string in the reader's language (`processI18n`). */
export type ChartTextTranslate = (text: string) => string;

type ChartSeriesEntry = ChartSeries["data"][number];

interface TextPoint {
  x?: unknown;
  label?: unknown;
}

function translateText(value: unknown, translate: ChartTextTranslate): unknown {
  return typeof value === "string" ? translate(value) : value;
}

/**
 * A point's category (`x`) and `label` are what Apex prints on the axis, in
 * the tooltip and on a slice: a `$` key there is translated like a name. A
 * date or a number is left alone, and so is any string without the `$`.
 */
function localizePoint(
  point: ChartSeriesEntry,
  translate: ChartTextTranslate,
): ChartSeriesEntry {
  if (typeof point !== "object" || point === null) return point;
  const text = point as TextPoint;
  const localized: Record<string, unknown> = { ...point };
  if ("x" in text) localized.x = translateText(text.x, translate);
  if ("label" in text) localized.label = translateText(text.label, translate);
  return localized as unknown as ChartSeriesEntry;
}

/**
 * A series as the reader sees it: its `name`, and the categories and labels
 * of its points, translated when they follow the `$`-prefix convention.
 * Apex prints all of them verbatim, so a route's `$` keys are resolved here,
 * in the browser, in the language on screen.
 */
export function localizeSeries(
  series: ChartSeries,
  translate: ChartTextTranslate,
): ChartSeries {
  return {
    ...series,
    name: translateText(series.name, translate) as string,
    data: Array.isArray(series.data)
      ? series.data.map((point) => localizePoint(point, translate))
      : series.data,
  };
}

/** The slices of a circular chart, their labels translated. */
export function localizeDonutRecords(
  records: DonutRecord[],
  translate: ChartTextTranslate,
): DonutRecord[] {
  return records.map((record) => ({
    ...record,
    label: translateText(record.label, translate) as string,
  }));
}
