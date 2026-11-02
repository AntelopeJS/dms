import { readFileSync } from "node:fs";

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isText(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The entry `node` holds under `key`. A key inherited from `Object.prototype`
 * names no entry, and an own `__proto__` entry is found like any other.
 * @param {Record<string, unknown>} node
 * @param {string} key
 * @returns {unknown}
 */
function ownEntry(node, key) {
  return Object.entries(node).find(([name]) => name === key)?.[1];
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
  const child = ownEntry(node, key);
  if (!isRecord(child)) throw new TypeError(`${key} is not a JSON object`);
  return child;
}

/**
 * The text that `node` holds under `key`.
 * @param {Record<string, unknown>} node
 * @param {string} key
 * @returns {string}
 */
export function text(node, key) {
  const value = optionalText(node, key);
  if (value === undefined) throw new TypeError(`${key} is not a JSON string`);
  return value;
}

/**
 * The text that `node` holds under `key`, or `undefined` when it holds none.
 * An entry that is not text is refused.
 * @param {Record<string, unknown>} node
 * @param {string} key
 * @returns {string | undefined}
 */
export function optionalText(node, key) {
  const value = ownEntry(node, key);
  if (value === undefined) return undefined;
  if (!isText(value)) throw new TypeError(`${key} is not a JSON string`);
  return value;
}

/**
 * The member of a JSON value that a path step names: an own entry of an object,
 * or the element at an index of an array or of a text.
 * @param {unknown} node
 * @param {string} step
 * @returns {unknown}
 */
function member(node, step) {
  if (isRecord(node)) return ownEntry(node, step);
  if (Array.isArray(node) || isText(node)) {
    return /^(?:0|[1-9]\d*)$/.test(step) ? node.at(Number(step)) : undefined;
  }
  return undefined;
}

/**
 * The text at a dotted `path` below `node`, or `undefined` when a step is
 * missing or the end of the path is not text. A step into an object names an
 * own entry only, so `constructor` finds nothing.
 * @param {Record<string, unknown>} node
 * @param {string} path
 * @returns {string | undefined}
 */
export function textAt(node, path) {
  /** @type {unknown} */
  let current = node;
  for (const step of path.split(".")) current = member(current, step);
  return isText(current) ? current : undefined;
}
