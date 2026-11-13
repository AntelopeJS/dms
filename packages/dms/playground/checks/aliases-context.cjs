const { realpathSync } = require("node:fs");
const nodePath = require("node:path");
const ts = require("typescript");

const root = nodePath.resolve(__dirname, "..");
const repository = nodePath.resolve(root, "../../..");
const config = ts.readConfigFile(
  nodePath.join(repository, ".dependency-cruiser.tsconfig.json"),
  (path) => ts.sys.readFile(path),
);
const { options } = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  repository,
);
const cache = ts.createModuleResolutionCache(
  repository,
  (path) => path,
  options,
);
const server = realpathSync(nodePath.join(root, "src"));
const client = realpathSync(nodePath.join(root, "frontend-vue"));
const layers = ["core", "ui", "layout", "auth", "onboarding"].map((layer) =>
  realpathSync(nodePath.join(root, `../frontend-vue/layers/dms-${layer}/app`)),
);
const skippedDirectories = new Set([
  "node_modules",
  "dist",
  ".nuxt",
  ".output",
]);
const codeExtensions = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
]);
/** @type {string[]} */
const failures = [];

module.exports = {
  root,
  repository,
  options,
  cache,
  server,
  client,
  layers,
  skippedDirectories,
  codeExtensions,
  failures,
};
