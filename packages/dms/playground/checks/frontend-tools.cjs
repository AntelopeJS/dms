const { createRequire } = require("node:module");
const nodePath = require("node:path");
const {
  isCallable,
  isCssNode,
  isRecord,
  isTextList,
} = require("./loaded-values.mjs");

const frontendRequire = createRequire(
  nodePath.resolve(__dirname, "../../frontend-vue/package.json"),
);

/**
 * `tinyglobby`, which vite depends on, read for the one call the checks make.
 * @returns {{ globSync: (patterns: string | string[], options: { cwd?: string, absolute: boolean, dot?: boolean, expandDirectories?: boolean, ignore: string[] }) => string[] }}
 */
function loadGlob() {
  /** @type {unknown} */
  const loaded = createRequire(frontendRequire.resolve("vite/package.json"))(
    "tinyglobby",
  );
  if (!isRecord(loaded) || !isCallable(loaded.globSync))
    throw new TypeError("tinyglobby exports no globSync");
  const read = loaded.globSync;
  return {
    globSync(patterns, options) {
      const matches = read(patterns, options);
      if (!isTextList(matches))
        throw new TypeError(
          "tinyglobby.globSync did not return a list of paths",
        );
      return matches;
    },
  };
}

/**
 * `css-tree`, which jsdom depends on and which publishes no declarations, read for the two calls the checks make.
 * @returns {{
 *   parse: (css: string, options: { parseCustomProperty: boolean, onParseError: (error: Error) => void }) => object,
 *   walk: (ast: object, visit: (node: { type: string, name?: string }) => void) => void,
 * }}
 */
function loadCssTree() {
  /** @type {unknown} */
  const loaded = createRequire(frontendRequire.resolve("jsdom/package.json"))(
    "css-tree",
  );
  if (
    !isRecord(loaded) ||
    !isCallable(loaded.parse) ||
    !isCallable(loaded.walk)
  )
    throw new TypeError("css-tree exports no parse and walk");
  const read = loaded.parse;
  const visitAll = loaded.walk;
  return {
    parse(css, options) {
      const ast = read(css, options);
      if (!isRecord(ast))
        throw new TypeError("css-tree.parse did not return a syntax tree");
      return ast;
    },
    walk(ast, visit) {
      visitAll(ast, (/** @type {unknown} */ node) => {
        if (!isCssNode(node))
          throw new TypeError(
            "css-tree.walk visited something that is no node",
          );
        visit(node);
      });
    },
  };
}

module.exports = {
  vue: require("../../frontend-vue/node_modules/vue/compiler-sfc"),
  glob: loadGlob(),
  css: loadCssTree(),
};
