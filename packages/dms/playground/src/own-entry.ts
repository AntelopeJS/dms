/**
 * Reads an entry of a table keyed by caller-supplied text. A key inherited
 * from `Object.prototype`, such as `constructor`, names no entry.
 */
export function ownEntry<Value>(
  table: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
