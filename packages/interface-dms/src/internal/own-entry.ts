/**
 * The entry `table` holds under `key` itself. A key `Object.prototype`
 * supplies (`constructor`, `toString`) is not an entry.
 *
 * @internal
 */
export function ownEntry<Entry>(
  table: Readonly<Record<string, Entry>>,
  key: string,
): Entry | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
