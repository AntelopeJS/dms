const PLACEHOLDER = /\{(\w+)\}/g;

const isFillable = (value: unknown): value is string | number | boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

/**
 * A literal (non-`$`) text with its `{name}` placeholders filled from
 * `params`, as a `$` key's translation receives them. A placeholder without a
 * value stays as written, so text that merely holds braces is left alone.
 */
export function interpolateLiteral(
  text: string,
  params: Record<string, unknown>,
): string {
  return text.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    return isFillable(value) ? String(value) : placeholder;
  });
}
