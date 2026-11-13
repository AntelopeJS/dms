const helpers = require("../../../packages/interface-dms/dist/base/table-view/internal/factory-helpers.js");

/**
 * @param {{ func: (this: object, ...args: unknown[]) => unknown }} route
 * @param {object} receiver
 * @param {unknown[]} args
 */
function callRoute(route, receiver, args) {
  return route.func.call(receiver, ...args);
}

/**
 * @param {unknown} input
 */
function serializeTableViewDisplays(input) {
  return helpers.serializeTableViewDisplays(input);
}

/**
 * @param {unknown} input
 */
function serializeRowActions(input) {
  return helpers.serializeRowActions(input);
}

module.exports = { callRoute, serializeTableViewDisplays, serializeRowActions };
