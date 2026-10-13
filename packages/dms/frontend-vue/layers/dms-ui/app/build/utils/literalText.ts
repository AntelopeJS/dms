// `{{row.name}}` names a row field as a URL does; `{name}` is the shorthand a
// translation's parameters also use.
const PLACEHOLDER = /\{\{\s*row\.(\w+)\s*\}\}|(?<!\{)\{(\w+)\}(?!\})/g;

const isFillable = (value: unknown): value is string | number | boolean =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

/**
 * A literal (non-`$`) text with its `{{row.name}}` / `{name}` placeholders
 * filled from `params`, as a `$` key's translation receives them. A placeholder without a
 * value stays as written, so text that merely holds braces is left alone.
 */
export function interpolateLiteral(
  text: string,
  params: Record<string, unknown>,
): string {
  return text.replace(PLACEHOLDER, (placeholder, rowName, shortName) => {
    const name: string = rowName ?? shortName;
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    return isFillable(value) ? String(value) : placeholder;
  });
}
