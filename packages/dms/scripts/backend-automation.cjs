const { createRequire } = require("node:module");

/**
 * The built automation catalogue: the compiled copy of `src/automation`, so it is typed by the source.
 * @returns {typeof import("../src/automation")}
 */
function loadAutomation() {
  return createRequire(__filename)("../dist/automation");
}

module.exports = loadAutomation();
