import type { StoredRow } from "@antelopejs/interface-data-api/metadata";

type StoredValue = StoredRow[string];

/** Whether a stored value is one an id column holds: no row, list or document. */
const isScalarValue = (
  value: StoredValue,
): value is Extract<
  StoredValue,
  string | number | boolean | Date | null | undefined
> => value instanceof Date || value === null || typeof value !== "object";

/**
 * The text of the id a row holds under its id field, as the routes compare
 * and answer it: a string, a number, a boolean, a date, `null` or an absent
 * value reads as `String` reads it.
 *
 * @throws Error when the id holds a row, a list or a document, which no id
 * column stores
 */
export function rowIdText(value: StoredValue): string {
  if (isScalarValue(value)) return String(value);
  throw new Error("A row id holds a row, a list or a document");
}
