/** The text of a cell value, as the browser searches and sorts it. */
export const textOf = (value: unknown): string =>
  value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

/** Orders two cell values the browser sorts: numbers by value, else as text. */
export const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return textOf(a).localeCompare(textOf(b), undefined, { numeric: true });
};
