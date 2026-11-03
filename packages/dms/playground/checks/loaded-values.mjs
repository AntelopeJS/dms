/**
 * Checks on what a module loaded by path returned, so the checks read it as
 * `unknown` and narrow it instead of trusting a declared type.
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>} True for an object that is not an array or null
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is (...args: unknown[]) => unknown} True for a function; its result is read as `unknown`
 */
export function isCallable(value) {
  return typeof value === "function";
}

/**
 * @param {unknown} value
 * @returns {value is string} True for a string
 */
function isText(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is string[]} True for a list of strings
 */
export function isTextList(value) {
  return Array.isArray(value) && value.every(isText);
}

/**
 * @param {unknown} value
 * @returns {value is { type: string, name?: string }} True for an object with a string `type` and, when it has one, a string `name`
 */
export function isCssNode(value) {
  return (
    isRecord(value) &&
    isText(value.type) &&
    (value.name === undefined || isText(value.name))
  );
}
