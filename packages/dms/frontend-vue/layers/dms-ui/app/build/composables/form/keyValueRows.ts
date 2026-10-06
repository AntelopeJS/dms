/** A pair as the key-value editor shows it: a row of the repeater. */
export interface KeyValueRow {
  key?: string;
  value?: unknown;
  /** Whether the pair is on (`toggleable` editors only). */
  enabled?: boolean;
}

/** A pair's value in a `toggleable` editor. */
interface ToggledValue {
  value: unknown;
  enabled: boolean;
}

const KEY_MISSING = "$dms.field_errors.key_missing";
const KEY_DUPLICATE = "$dms.field_errors.key_duplicate";

const nameOf = (row: KeyValueRow): string => (row.key ?? "").trim();
const isBlank = (value: unknown): boolean =>
  value === undefined || value === null || value === "";
const isUnfilled = (row: KeyValueRow): boolean =>
  !nameOf(row) && isBlank(row.value);

/** The rows of a key-value object, in its order. */
export function keyValueRows(
  value: Record<string, unknown> | null | undefined,
  toggleable: boolean | undefined,
): KeyValueRow[] {
  return Object.entries(value ?? {}).map(([key, entry]) => {
    if (!toggleable) return { key, value: entry };
    const toggled = (entry ?? {}) as Partial<ToggledValue>;
    return { key, value: toggled.value, enabled: toggled.enabled ?? true };
  });
}

/** The object the rows stand for, the rows nobody filled left out. */
export function keyValueObject(
  rows: readonly KeyValueRow[],
  toggleable: boolean | undefined,
): Record<string, unknown> {
  return Object.fromEntries(
    rows
      .filter((row) => !isUnfilled(row))
      .map((row) => [
        nameOf(row),
        toggleable
          ? { value: row.value ?? null, enabled: row.enabled ?? true }
          : row.value,
      ]),
  );
}

/**
 * What keeps the rows from being an object (an i18n key): a value without
 * a name, or a name given twice.
 */
export function keyValueProblem(
  rows: readonly KeyValueRow[],
): string | undefined {
  const filled = rows.filter((row) => !isUnfilled(row));
  if (filled.some((row) => !nameOf(row))) return KEY_MISSING;
  const names = filled.map(nameOf);
  return new Set(names).size === names.length ? undefined : KEY_DUPLICATE;
}
