import assert from "node:assert/strict";
import test from "node:test";
import {
  CreateDataType,
  DataType,
} from "../dist/component-options/data-type.js";
import { remapRecordFileKeys } from "../dist/base/helpers/file-refs.js";
import { ImageType } from "../dist/base/data-types/default/files.js";
import { serializeTableViewDisplays } from "../dist/base/table-view/internal/factory-helpers.js";
import { collectExtensionErrors } from "../dist/page/internal/extension-validation.js";

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
  const [display] = serializeTableViewDisplays({
    displays: [{ id: "toString", options: { kept: true } }],
  });
  assert.deepEqual(display.options, { kept: true });
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
