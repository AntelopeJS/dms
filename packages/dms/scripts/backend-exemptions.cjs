const constructorExemptions = {
  "implementations/dms-base/search-route.ts:403":
    "      const entryInstance = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:80":
    "      const stored = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:175":
    "  const owner = controller.constructor;",
  "implementations/dms-base/table-view.ts:378":
    "    const stored = model.constructor.fromDatabase(row);",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:66":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:77":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
};
const builtinExemptions = {
  "implementations/dms-builder/engine/module-loader.ts:1":
    'import { createRequire } from "node:module";',
  "test/unit/interfaces/dms-base/table-view-evaluation-order.fixture.ts:1":
    'import Module, { findPackageJSON } from "node:module";',
};
const requireResolveExemptions = {
  "src/implementations/dms-builder/engine/module-loader.ts:24":
    "  return require.resolve(specifier);",
  "dist/implementations/dms-builder/engine/module-loader.js:18":
    "    return require.resolve(specifier);",
  "src/store/compatibility.ts:56":
    "  const entryFolder = path.dirname(require.resolve(INTERFACE_ENTRY));",
  "dist/store/compatibility.js:45":
    "    const entryFolder = node_path_1.default.dirname(require.resolve(INTERFACE_ENTRY));",
};

/**
 * The builder engine loads modules its sources cannot name: the block catalog,
 * the DataTypes and the catalog providers carry their specifiers as data, and
 * a project's own files resolve packages from where they sit. One file holds
 * every such load.
 */
const loaderExemptions = {
  "src/implementations/dms-builder/engine/module-loader.ts:1":
    'import { createRequire } from "node:module";',
  "src/implementations/dms-builder/engine/module-loader.ts:12":
    "  const loaded: unknown = require(specifier);",
  "src/implementations/dms-builder/engine/module-loader.ts:18":
    "  const loaded: unknown = createRequire(file)(specifier);",
  "src/implementations/dms-builder/engine/module-loader.ts:29":
    "  return Object.entries(require.cache).map(([file, entry]) => {",
  "dist/implementations/dms-builder/engine/module-loader.js:10":
    "    const loaded = require(specifier);",
  "dist/implementations/dms-builder/engine/module-loader.js:14":
    "    const loaded = (0, node_module_1.createRequire)(file)(specifier);",
  "dist/implementations/dms-builder/engine/module-loader.js:21":
    "    return Object.entries(require.cache).map(([file, entry]) => {",
  "src/test/unit/builder/helpers/module-cache.ts:8":
    "  Object.assign(require.cache, { [file]: { exports } });",
  "src/test/unit/builder/helpers/module-cache.ts:13":
    "  delete require.cache[file];",
  "dist/test/unit/builder/helpers/module-cache.js:6":
    "    Object.assign(require.cache, { [file]: { exports } });",
  "dist/test/unit/builder/helpers/module-cache.js:9":
    "    delete require.cache[file];",
  "src/test/integration/mcp-startup-modules.test.ts:6":
    "const tsMorphFilesAtStart = Object.keys(require.cache).filter((file) =>",
  "dist/test/integration/mcp-startup-modules.test.js:9":
    "const tsMorphFilesAtStart = Object.keys(require.cache).filter((file) => file.includes(TS_MORPH_SEGMENT));",
};

module.exports = {
  loaderExemptions,
  constructorExemptions,
  builtinExemptions,
  requireResolveExemptions,
};
