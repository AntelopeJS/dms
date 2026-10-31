const nodePath = require("node:path");

const root = nodePath.resolve(__dirname, "..");

/**
 * The built automation catalogue: the compiled copy of `src/automation`, so it is typed by the source.
 * @returns {typeof import("../src/automation")}
 */
function loadAutomation() {
  return require(nodePath.join(root, "dist/automation"));
}

module.exports = loadAutomation();
