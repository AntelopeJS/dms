import {
  isNumber,
  isString,
} from "../../../../../dms-core/app/utils/type-check";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";

/** A horizontal bar puts its categories on the vertical axis, which Apex labels through the y formatter. */
export function isHorizontalBar(input: UseApexChartInput): boolean {
  return input.type === "bar" && input.orientation !== "vertical";
}

/**
 * Writes a category as text: through `xAxisFormatter`, else as a date when
 * the axis is datetime and the category is a timestamp or a date string.
 */
export function categoryLabelFormatter(
  input: UseApexChartInput,
): ((value: string | number) => string) | undefined {
  const { xAxisFormatter } = input;
  if (xAxisFormatter) {
    return (value) =>
      xAxisFormatter(String(value), isNumber(value) ? value : undefined);
  }
  if (input.xaxisType !== "datetime") return undefined;
  const format = new Intl.DateTimeFormat(input.locale, { dateStyle: "medium" });
  return (value) => {
    const date = new Date(
      isString(value) && /^-?\d+$/.test(value) ? Number(value) : value,
    );
    return Number.isNaN(date.getTime()) ? String(value) : format.format(date);
  };
}
