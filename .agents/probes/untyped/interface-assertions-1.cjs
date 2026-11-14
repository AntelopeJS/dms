const describeModule = require("../../../packages/interface-dms/dist/base/block-registry/internal/describe.js");
const { SelectType } = require("../../../packages/interface-dms/dist/base/data-types/default/choices.js");
const { authorizeAction } = require("../../../packages/interface-dms/dist/base/table-view/internal/auth.js");

/**
 * @param {unknown} schema
 */
function rerunDescribeSchema(schema) {
  return describeModule.describeSchema(schema);
}

/**
 * @param {unknown} schema
 */
function rerunDescribeOptions(schema) {
  return describeModule.describeOptions(schema);
}

/**
 * @param {unknown} options
 */
function selectTypeOf(options) {
  return new SelectType(options);
}

module.exports = {
  describeSchema: describeModule.describeSchema,
  describeOptions: describeModule.describeOptions,
  rerunDescribeSchema,
  rerunDescribeOptions,
  selectTypeOf,
  authorizeAction,
};
