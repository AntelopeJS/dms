const { createRequire } = require("node:module");
const nodePath = require("node:path");

const frontendRequire = createRequire(
  nodePath.resolve(__dirname, "../../frontend-vue/package.json"),
);

/**
 * The Vue compiler, resolved from the frontend package the playground does not depend on.
 * @returns {typeof import("../../frontend-vue/node_modules/vue/compiler-sfc")}
 */
function loadVueCompiler() {
  return frontendRequire("vue/compiler-sfc");
}

/**
 * The glob matcher vite ships, typed for the calls the checks make.
 * @returns {{ globSync: (patterns: string | string[], options: { cwd?: string, absolute: boolean, dot?: boolean, expandDirectories?: boolean, ignore: string[] }) => string[] }}
 */
function loadGlob() {
  return createRequire(frontendRequire.resolve("vite/package.json"))(
    "tinyglobby",
  );
}

/**
 * The CSS parser jsdom ships; it publishes no declarations, so this types the two calls the checks make.
 * @returns {{
 *   parse: (css: string, options: { parseCustomProperty: boolean, onParseError: (error: Error) => void }) => object,
 *   walk: (ast: object, visit: (node: { type: string, name?: string }) => void) => void,
 * }}
 */
function loadCssTree() {
  return createRequire(frontendRequire.resolve("jsdom/package.json"))(
    "css-tree",
  );
}

module.exports = {
  vue: loadVueCompiler(),
  glob: loadGlob(),
  css: loadCssTree(),
};
