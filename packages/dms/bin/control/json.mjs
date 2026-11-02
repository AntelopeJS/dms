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

/**
 * @template T
 * @typedef {(value: unknown) => value is T} Guard A check that narrows a parsed JSON value to `T`
 */

/**
 * @param {unknown} value A parsed JSON value
 * @returns {value is number} True for a number
 */
export function isNumber(value) {
  return typeof value === "number";
}

/**
 * @param {unknown} value A parsed JSON value
 * @returns {value is boolean} True for a boolean
 */
export function isBoolean(value) {
  return typeof value === "boolean";
}

/**
 * @param {unknown} value A parsed JSON value
 * @returns {value is null} True for null
 */
function isNull(value) {
  return value === null;
}

/**
 * @template T
 * @param {Guard<T>} item What each element must be
 * @returns {Guard<T[]>} A guard for lists
 */
export function arrayOf(item) {
  /**
   * @param {unknown} value A parsed JSON value
   * @returns {value is T[]} True for a list whose every element passes `item`
   */
  return (value) => Array.isArray(value) && value.every(item);
}

/**
 * @template T
 * @param {Guard<T>} item What each value must be
 * @returns {Guard<Record<string, T>>} A guard for objects keyed by any string
 */
export function recordOf(item) {
  /**
   * @param {unknown} value A parsed JSON value
   * @returns {value is Record<string, T>} True for an object whose every value passes `item`
   */
  return (value) => isRecord(value) && Object.values(value).every(item);
}

/**
 * @template T
 * @param {Guard<T>} guard What the value must be unless it is null
 * @returns {Guard<T | null>} A guard that also accepts null
 */
export function nullable(guard) {
  return either(guard, isNull);
}

/**
 * @template A
 * @template B
 * @param {Guard<A>} first One accepted form
 * @param {Guard<B>} second The other accepted form
 * @returns {Guard<A | B>} A guard for either form
 */
export function either(first, second) {
  /**
   * @param {unknown} value A parsed JSON value
   * @returns {value is A | B} True when one of the forms matches
   */
  return (value) => first(value) || second(value);
}

/**
 * @template {string} Name
 * @param {Name[]} names The accepted strings
 * @returns {Guard<Name>} A guard for one of the names
 */
export function oneOf(names) {
  /**
   * @param {unknown} value A parsed JSON value
   * @returns {value is Name} True for one of the names
   */
  return (value) => isString(value) && names.some((name) => name === value);
}

/**
 * @template T
 * @param {new (...args: never[]) => T} constructor The class
 * @returns {Guard<T>} A guard for its instances
 */
export function instanceOf(constructor) {
  /**
   * @param {unknown} value A value
   * @returns {value is T} True for an instance
   */
  return (value) => value instanceof constructor;
}

/**
 * @param {Record<string, unknown>} record An object
 * @param {string} key The property
 * @returns {unknown} Its own value, undefined when it holds none
 */
function ownValue(record, key) {
  return Object.getOwnPropertyDescriptor(record, key)?.value;
}

/**
 * @template {Record<string, Guard<unknown>>} Required
 * @template {Record<string, Guard<unknown>>} Optional
 * @typedef {{ [Key in keyof Required]: Required[Key] extends Guard<infer T> ? T : never } & { [Key in keyof Optional]?: Optional[Key] extends Guard<infer T> ? T : never }} Properties
 */

/**
 * An object with the required properties, each passing its guard, and the
 * optional ones, which pass theirs when present. Other properties are not
 * looked at. Only own properties count.
 *
 * @template {Record<string, Guard<unknown>>} Required
 * @template {Record<string, Guard<unknown>>} [Optional=Record<never, never>]
 * @param {Required} required The guard of each required property
 * @param {Optional} [optional] The guard of each optional property
 * @returns {Guard<Properties<Required, Optional>>} A guard for the object
 */
export function objectOf(required, optional) {
  /**
   * @param {unknown} value A parsed JSON value
   * @returns {value is Properties<Required, Optional>} True for an object with these properties
   */
  return (value) =>
    isRecord(value) &&
    Object.entries(required).every(([key, guard]) =>
      guard(ownValue(value, key)),
    ) &&
    Object.entries(optional ?? {}).every(
      ([key, guard]) =>
        ownValue(value, key) === undefined || guard(ownValue(value, key)),
    );
}

/**
 * @template T
 * @param {Guard<T>} guard What the value must be
 * @param {unknown} value The value read
 * @param {string} source Where it was read, named in the error
 * @param {string} expected What the value should be, named in the error
 * @returns {T} The value
 * @throws When the value does not pass the guard
 */
export function decode(guard, value, source, expected) {
  if (guard(value)) return value;
  throw new Error(`${source} is malformed: expected ${expected}`);
}
