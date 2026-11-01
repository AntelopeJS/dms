const constructorExemptions = {
  "implementations/dms-base/search-route.ts:400":
    "      const entryInstance = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:87":
    "      const stored = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:124":
    "    controller.constructor as ConstructorParameters<typeof TableViewMeta>[0],",
  "implementations/dms-base/table-view.ts:190":
    "    controller.constructor as ControllerClass;",
  "implementations/dms-base/table-view.ts:387":
    "    const stored = model.constructor.fromDatabase(row);",
  "test/helpers/invite-entry-fixtures.ts:123":
    "  const candidate: unknown = route.proto?.constructor;",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:76":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
  "test/unit/implementations/dms-base/table-view-shared-controller.test.ts:87":
    "    const meta = GetMetadata(instance.constructor, TableViewMeta);",
};
const builtinExemptions = {
  "test/unit/interfaces/dms-base/table-view-evaluation-order.fixture.ts:1":
    'import Module, { findPackageJSON } from "node:module";',
};
const requireResolveExemptions = {
  "src/store/compatibility.ts:32":
    "  let folder = path.dirname(require.resolve(INTERFACE_ENTRY));",
  "dist/store/compatibility.js:26":
    "    let folder = node_path_1.default.dirname(require.resolve(INTERFACE_ENTRY));",
};

module.exports = {
  constructorExemptions,
  builtinExemptions,
  requireResolveExemptions,
};
