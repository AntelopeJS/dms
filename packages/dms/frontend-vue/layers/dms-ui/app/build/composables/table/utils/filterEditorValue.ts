import type {
  DataType,
  DataTypeFilterEditorValue,
} from "#dms-core/app/composables/data-types/useDataType";

const LIST_SEPARATOR = ",";
const BETWEEN_MODE = "is_between";

/** A number type's filter: the number a numeric text names, else the text. */
export const numberFilterEditorValue: DataTypeFilterEditorValue = (text) => {
  const parsed = Number(text);
  return text.trim() !== "" && Number.isFinite(parsed) ? parsed : text;
};

/** A date's filter: the two days of a range, a single day as written. */
export const dateFilterEditorValue: DataTypeFilterEditorValue = (text, mode) =>
  mode === BETWEEN_MODE
    ? text.split(LIST_SEPARATOR).map((item) => item.trim())
    : text;

/**
 * The value a filter's editor reads: a declared text value converted by its
 * column's data type, any other value as it is.
 */
export function filterEditorValue(
  dataType: Pick<DataType, "filterEditorValue"> | undefined,
  mode: string,
  value: unknown,
): unknown {
  if (typeof value !== "string" || !dataType?.filterEditorValue) return value;
  return dataType.filterEditorValue(value, mode);
}
