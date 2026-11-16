import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { isNumber, isObject } from "#dms-core/app/utils/type-check";

/** The text of a cell value, as the browser searches and sorts it. */
export const searchTextOf = (
  value: Parameters<DataTypeFormatter>[0],
): string =>
  value === null || value === undefined
    ? ""
    : isObject(value) || Array.isArray(value)
      ? JSON.stringify(value)
      : String(value);

/** Orders two cell values the browser sorts: numbers by value, else as text. */
export const compareValues = (
  a: Parameters<typeof searchTextOf>[0],
  b: Parameters<typeof searchTextOf>[0],
): number => {
  if (isNumber(a) && isNumber(b)) return a - b;
  return searchTextOf(a).localeCompare(searchTextOf(b), undefined, {
    numeric: true,
  });
};
