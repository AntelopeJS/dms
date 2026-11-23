/** `value`, read where a test expects it to exist; a missing value fails the test there. */
export function defined<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new TypeError(`Expected a value, got ${String(value)}`);
  }
  return value;
}
