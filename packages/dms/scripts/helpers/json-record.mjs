import { readFileSync } from "node:fs";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The JSON object in the file at `path`, as `JSON.parse` returns it. No entry
 * is dropped or rebuilt, so an own `__proto__` entry stays.
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
export function readJsonRecord(path) {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed)) throw new TypeError(`${path} is not a JSON object`);
  return parsed;
}

/**
 * The object that `node` holds under `key`.
 * @param {Record<string, unknown>} node
 * @param {string} key
 * @returns {Record<string, unknown>}
 */
export function group(node, key) {
  const child = Object.entries(node).find(([name]) => name === key)?.[1];
  if (!isRecord(child)) throw new TypeError(`${key} is not a JSON object`);
  return child;
}
