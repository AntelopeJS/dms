const constructorExemptions = {
  "implementations/dms-base/bulk-selection.ts:104":
    "      (thisObj as ControllerInstance).constructor,",
  "implementations/dms-base/search-route.ts:66":
    "  const columnType = GetMetadata(target.thisObj.constructor, TableViewMeta)",
  "implementations/dms-base/search-route.ts:166":
    "  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);",
  "implementations/dms-base/search-route.ts:200":
    "  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);",
  "implementations/dms-base/search-route.ts:246":
    "  const tableViewMeta = GetMetadata(thisObj.constructor, TableViewMeta);",
  "implementations/dms-base/search-route.ts:304":
    "    const searchableMeta = GetMetadata(thisObj.constructor, SearchableMeta);",
  "implementations/dms-base/search-route.ts:401":
    "      const entryInstance = model.constructor.fromDatabase(entry);",
  "implementations/dms-base/table-view.ts:88":
    "        model.constructor.fromDatabase(entry),",
  "implementations/dms-base/table-view.ts:124":
    "    controller.constructor as ConstructorParameters<typeof TableViewMeta>[0],",
  "implementations/dms-base/table-view.ts:190":
    "    controller.constructor as ControllerClass;",
  "implementations/dms-base/table-view.ts:390":
    "      model.constructor.fromDatabase(row),",
  "implementations/dms-base/table-view.ts:454":
    "  const tableViewMetadata = GetMetadata(controller.constructor, TableViewMeta);",
  "implementations/dms-base/table-view.ts:484":
    "  const tableViewMetadata = GetMetadata(controller.constructor, TableViewMeta);",
  "test/helpers/invite-entry-fixtures.ts:92":
    "  const controller = await GetControllerInstance(route.proto.constructor, ctx);",
  "test/helpers/invite-entry-fixtures.ts:127":
    "  const controller = await GetControllerInstance(route.proto.constructor, ctx);",
  "test/helpers/invite-entry-fixtures.ts:146":
    "  const controller = await GetControllerInstance(route.proto.constructor, ctx);",
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
