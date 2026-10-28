import { isString } from "../../../../dms-core/app/utils/type-check";
import type { ChartSeries, DonutRecord } from "./types";

/** Writes one display string in the reader's language (`processI18n`). */
export type ChartTextTranslate = (text: string) => string;

type ChartSeriesEntry = ChartSeries["data"][number];

function translateText<T extends string | number | Date | undefined>(
  value: T,
  translate: ChartTextTranslate,
) {
  return isString(value) ? translate(value) : value;
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
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The shared isObject guard widens the point owner's fields to unknown; typeof preserves ChartSeriesEntry without another assertion or narrower runtime validation.
  if (typeof point !== "object" || point === null) return point;
  const localized: typeof point & { label?: string } = { ...point };
  if ("x" in point) localized.x = translateText(point.x, translate);
  if ("label" in point) localized.label = translateText(point.label, translate);
  return localized;
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
    name: translateText(series.name, translate),
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
    label: translateText(record.label, translate),
  }));
}
