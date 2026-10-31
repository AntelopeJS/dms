import { readFileSync } from "node:fs";

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The JSON object in `text`, as `JSON.parse` returns it. No entry is dropped
 * or rebuilt, so an own `__proto__` entry stays.
 * @param {string} text
 * @param {string} source
 * @returns {Record<string, unknown>}
 */
export function parseJsonRecord(text, source) {
  /** @type {unknown} */
  const parsed = JSON.parse(text);
  if (!isRecord(parsed)) throw new TypeError(`${source} is not a JSON object`);
  return parsed;
}

/**
 * The JSON object in the file at `path`.
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
export function readJsonRecord(path) {
  return parseJsonRecord(readFileSync(path, "utf8"), path);
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
