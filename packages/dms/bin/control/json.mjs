import { readFileSync } from "node:fs";

/**
 * Reads of JSON a program received, narrowed through checks instead of typed
 * by assertion. Everything here takes `unknown` because JSON arrives
 * unchecked.
 */

/**
 * @param {unknown} value A parsed JSON value
 * @returns {value is Record<string, unknown>} True for an object that is not an array or null
 */
export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value A parsed JSON value
 * @returns {value is string} True for a string
 */
export function isString(value) {
  return typeof value === "string";
}

/**
 * The string an object holds under its own key.
 *
 * @param {unknown} body A parsed JSON value
 * @param {string} key The property
 * @returns {string | undefined} The string, or undefined when `body` is no object or the property is absent or not a string
 */
export function stringField(body, key) {
  if (!isRecord(body)) return undefined;
  /** @type {unknown} */
  const value = Object.getOwnPropertyDescriptor(body, key)?.value;
  return isString(value) ? value : undefined;
}

/**
 * The first element of a JSON array, when it is a string.
 *
 * @param {unknown} body A parsed JSON value
 * @returns {string | undefined} The first string, or undefined when `body` is no array or starts with anything else
 */
export function firstString(body) {
  if (!Array.isArray(body)) return undefined;
  /** @type {unknown} */
  const first = body.at(0);
  return isString(first) ? first : undefined;
}

/**
 * The objects a JSON file lists, kept as written.
 *
 * @param {string} file The JSON file
 * @returns {Record<string, unknown>[]} The listed objects
 * @throws When the file holds anything but a list of objects
 */
export function readRecordList(file) {
  /** @type {unknown} */
  const stored = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(stored))
    throw new Error(`${file} is not a list of objects`);
  const records = stored.filter(isRecord);
  if (records.length !== stored.length)
    throw new Error(`${file} is not a list of objects`);
  return records;
}
