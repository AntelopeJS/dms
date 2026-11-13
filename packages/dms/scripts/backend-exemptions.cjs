const constructorExemptions = {
  "implementations/dms-base/search-route.ts:402":
    "      const entryInstance = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:75":
    "      const stored = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:172":
    "  const owner = controller.constructor;",
  "implementations/dms-base/table-view.ts:373":
    "    const stored = model.constructor.fromDatabase(row);",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:66":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:77":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
};
const builtinExemptions = {
  "test/unit/interfaces/dms-base/table-view-evaluation-order.fixture.ts:1":
    'import Module, { findPackageJSON } from "node:module";',
};
const requireResolveExemptions = {
  "src/store/compatibility.ts:56":
    "  const entryFolder = path.dirname(require.resolve(INTERFACE_ENTRY));",
  "dist/store/compatibility.js:45":
    "    const entryFolder = node_path_1.default.dirname(require.resolve(INTERFACE_ENTRY));",
};

module.exports = {
  constructorExemptions,
  builtinExemptions,
  requireResolveExemptions,
};
