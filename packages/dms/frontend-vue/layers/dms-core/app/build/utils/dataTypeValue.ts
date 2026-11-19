import type { DataTypeRow, DataTypeValue } from "../../types/data-type";

/** Whether a value is a row: an object that is neither a list nor a date. */
export function isDataTypeRow(value: DataTypeValue): value is DataTypeRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * The text of a value: a row, or a list that holds one, as its JSON; a list
 * of anything else item by item, the way `String` joins it; a date or a
 * primitive the way `String` writes it.
 */
export function textOf(value: DataTypeValue): string {
  if (Array.isArray(value)) {
    if (value.some(isDataTypeRow)) return JSON.stringify(value);
    return value
      .map((item) => (item === null || item === undefined ? "" : textOf(item)))
      .join(",");
  }
  return isDataTypeRow(value) ? JSON.stringify(value) : String(value);
}

/**
 * The value a row holds at a dotted path (`customer.name`, `lines.0.total`),
 * or `undefined` once the path leaves the row. A numeric step reads the item
 * of a list, or the member of a row under that number.
 */
export function readFieldPath(
  row: DataTypeRow | undefined,
  path: string,
): DataTypeValue {
  let value: DataTypeValue = row;
  for (const step of path.split(".")) {
    const index = Number(step);
    if (Array.isArray(value)) value = value[index];
    else if (isDataTypeRow(value))
      value = value[Number.isNaN(index) ? step : String(index)];
    else return undefined;
  }
  return value;
}
