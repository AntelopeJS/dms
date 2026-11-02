/**
 * The value `table` holds under `key` itself. A key that only
 * `Object.prototype` answers, such as `constructor` or `toString`, reads as
 * absent.
 */
export function ownValue<Value>(
  table: Readonly<Record<string, Value>>,
  key: string,
): Value | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
