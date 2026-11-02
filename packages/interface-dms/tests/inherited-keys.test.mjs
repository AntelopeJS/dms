import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateDataType,
  DataType,
  getDataTypeId,
  RegisterDataCompareMode,
} from "../dist/component-options/data-type.js";
import { remapRecordFileKeys } from "../dist/base/helpers/file-refs.js";
import { ImageType } from "../dist/base/data-types/default/files.js";
import {
  buildFormRedirectUrl,
  serializeTableViewDisplays,
} from "../dist/base/table-view/internal/factory-helpers.js";
import { collectExtensionErrors } from "../dist/page/internal/extension-validation.js";
import { tableViewFromSource } from "../dist/base/table-view/source.js";

const INHERITED = ["constructor", "toString", "valueOf", "hasOwnProperty"];

await test("an id no data type registered is unknown, whatever Object.prototype holds", () => {
  for (const id of INHERITED) {
    assert.throws(() => CreateDataType(id), /Unknown type/);
  }
});

await test("a compare mode id no mode registered filters nothing", () => {
  class Plain extends DataType {
    defaultInputComponent() {
      throw new Error("not reached");
    }
    getValidation() {
      throw new Error("not reached");
    }
  }
  const plain = new Plain();
  for (const mode of INHERITED) {
    assert.equal(plain.filter({}, {}, "field", "value", mode, {}), false);
  }
});

await test("a record that lacks a file column named like an Object.prototype key stays without it", async () => {
  const columns = { constructor: { type: new ImageType() } };
  const mapped = await remapRecordFileKeys(
    columns,
    { title: "kept" },
    async (key) => key,
  );
  assert.deepEqual(Object.keys(mapped), ["title"]);
});

await test("a display id named like an Object.prototype key takes no built-in options", () => {
  for (const id of [...INHERITED, "__proto__"]) {
    const [display] = serializeTableViewDisplays({
      displays: [{ id, options: { kept: true } }],
    });
    assert.deepEqual(display.options, { kept: true }, id);
  }
});

await test("an extension anchored on an Object.prototype key finds no anchor on the page", () => {
  const info = {
    extensionName: "ext",
    targetFullId: "page",
    components: [{ key: "added", anchorPath: ["constructor"] }],
  };
  const errors = collectExtensionErrors(info, { own: {}, taken: new Map() });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not declare/);
});

await test("a form page repeating a parameter named like an Object.prototype key counts it like any repeated name", () => {
  const url = (name) =>
    buildFormRedirectUrl({
      pageSlug: `/a/:${name}`,
      formSlug: `/a/:${name}/t/:${name}/edit`,
    });
  assert.equal(url("constructor"), url("id").replaceAll("id", "constructor"));
});

await test("a quick filter on a name that is not a column but is an Object.prototype key is an unknown column", () => {
  for (const field of ["toString", "constructor", "valueOf"]) {
    assert.throws(
      () =>
        tableViewFromSource({
          columns: { title: { name: "Title", type: new ImageType() } },
          fetchUrl: "/rows",
          capabilities: { filter: true },
          quickFilters: [{ field }],
        }),
      new RegExp(`references unknown column "${field}"`),
    );
  }
});

await test("the id of a data type instance is looked up on its own prototype only", () => {
  assert.equal(getDataTypeId(new ImageType()), "image");
  assert.equal(getDataTypeId(Object.create(null)), undefined);
  assert.throws(() => getDataTypeId("not a data type"), TypeError);
});

await test("a compare mode class that does not implement filter is refused at registration", () => {
  class NoFilter {}
  assert.throws(() => RegisterDataCompareMode("no-filter")(NoFilter), /filter/);
});
