/**
 * @typedef {{
 *   name?: string;
 *   version?: string;
 *   private?: boolean;
 *   license?: string;
 *   repository?: { type?: string, url?: string, directory?: string };
 *   publishConfig?: { registry?: string, access?: string, provenance?: boolean };
 *   antelopeJs?: { implements?: string[] };
 *   dependencies?: Record<string, string>;
 * }} Manifest
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is boolean}
 */
function isBoolean(value) {
  return typeof value === "boolean";
}

/**
 * @param {unknown} value
 * @param {string} key
 * @param {(field: unknown) => boolean} isField
 * @returns {boolean} Whether the value is an object that holds the field absent or passing
 */
function optionally(value, key, isField) {
  return isRecord(value) && (!Object.hasOwn(value, key) || isField(value[key]));
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isStringList(value) {
  return Array.isArray(value) && value.every(isString);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every(isString);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isRepository(value) {
  return optionally(value, "type", isString) && optionally(value, "url", isString) && optionally(value, "directory", isString);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPublishConfig(value) {
  return optionally(value, "registry", isString) && optionally(value, "access", isString) && optionally(value, "provenance", isBoolean);
}

/**
 * Whether a parsed document holds the manifest fields the probe reads with the types it relies on. Other fields pass through untouched, since the probe writes the manifest back out.
 * @param {unknown} value
 * @returns {value is Manifest}
 */
export function isManifest(value) {
  return (
    isRecord(value) &&
    optionally(value, "name", isString) &&
    optionally(value, "version", isString) &&
    optionally(value, "private", isBoolean) &&
    optionally(value, "license", isString) &&
    optionally(value, "repository", isRepository) &&
    optionally(value, "publishConfig", isPublishConfig) &&
    optionally(value, "antelopeJs", (field) => optionally(field, "implements", isStringList)) &&
    optionally(value, "dependencies", isStringRecord)
  );
}

/**
 * @param {string} text The manifest's JSON text
 * @param {string} file Where the text came from, named when it is refused
 * @returns {Manifest} The decoded manifest; a document that is not one is refused
 */
export function parseManifest(text, file) {
  /** @type {unknown} */
  const manifest = JSON.parse(text);
  if (!isManifest(manifest)) throw new Error(`${file} is not a package manifest`);
  return manifest;
}
