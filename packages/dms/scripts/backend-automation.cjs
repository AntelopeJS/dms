const { createRequire } = require("node:module");
const {
  group,
  isRecord,
  optionalText,
  text,
} = require("./helpers/json-record.mjs");

/**
 * @typedef {{ properties?: Record<string, { title: string, description?: string }> }} Schema
 * @typedef {{ id: string, name: string, description: string, outputSchema: Schema }} Node
 * @typedef {Node & { configSchema: Schema }} Trigger
 * @typedef {Node & { inputSchema: Schema }} Action
 */

/**
 * @param {Record<string, unknown>} node
 * @param {string} key
 * @returns {unknown}
 */
function ownValue(node, key) {
  return Object.entries(node).find(([name]) => name === key)?.[1];
}

/**
 * The properties a catalogue schema names, each with its title and optional description.
 * @param {Record<string, unknown>} node
 * @param {string} key
 * @returns {Schema}
 */
function schemaOf(node, key) {
  const properties = ownValue(group(node, key), "properties");
  if (properties === undefined) return {};
  if (!isRecord(properties))
    throw new TypeError(`${key}.properties is not a JSON object`);
  return {
    properties: Object.fromEntries(
      Object.entries(properties).map(([name, property]) => {
        if (!isRecord(property))
          throw new TypeError(`${key}.properties.${name} is not a JSON object`);
        return [
          name,
          {
            title: text(property, "title"),
            description: optionalText(property, "description"),
          },
        ];
      }),
    ),
  };
}

/**
 * @param {Record<string, unknown>} built
 * @param {string} key
 * @returns {Record<string, unknown>[]}
 */
function listOf(built, key) {
  const list = ownValue(built, key);
  if (!Array.isArray(list) || !list.every(isRecord))
    throw new TypeError(`${key} is not a list of objects`);
  return list;
}

/**
 * @param {Record<string, unknown>} node
 * @returns {Node}
 */
function nodeOf(node) {
  return {
    id: text(node, "id"),
    name: text(node, "name"),
    description: text(node, "description"),
    outputSchema: schemaOf(node, "outputSchema"),
  };
}

/** @type {unknown} */
const built = createRequire(__filename)("../dist/automation");
if (!isRecord(built))
  throw new TypeError("dist/automation is not a module object");

/**
 * The built automation catalogue, read for the texts the backend checks compare with the locales.
 * @type {{ ACTIONS: Action[], TRIGGERS: Trigger[] }}
 */
module.exports = {
  ACTIONS: listOf(built, "ACTIONS").map((action) => ({
    ...nodeOf(action),
    inputSchema: schemaOf(action, "inputSchema"),
  })),
  TRIGGERS: listOf(built, "TRIGGERS").map((trigger) => ({
    ...nodeOf(trigger),
    configSchema: schemaOf(trigger, "configSchema"),
  })),
};
