/** The value `table` holds under `key`, never one its prototype answers. */
export const own = <Value>(
  table: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);
