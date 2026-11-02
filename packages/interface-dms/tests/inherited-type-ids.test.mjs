import assert from "node:assert/strict";
import test from "node:test";
import {
  DataType,
  RegisterDataType,
} from "../dist/component-options/data-type.js";
import {
  collectFileRefs,
  hasFileColumns,
  remapRecordFileKeys,
} from "../dist/base/helpers/file-refs.js";
import { validateKanbanOptions } from "../dist/base/table-view/internal/validation.js";

class Named extends DataType {
  defaultInputComponent() {
    throw new Error("not reached");
  }
  getValidation() {
    throw new Error("not reached");
  }
}
RegisterDataType("toString")(Named);

const columns = { photos: { type: new Named() } };

await test("a data type registered under an Object.prototype name is not a file type", async () => {
  assert.equal(hasFileColumns(columns), false);
  assert.deepEqual(collectFileRefs(columns, { photos: ["a", "b"] }), []);
  const mapped = await remapRecordFileKeys(
    columns,
    { photos: "a" },
    async (key) => `${key}!`,
  );
  assert.deepEqual(mapped, { photos: "a" });
});

await test("a kanban cannot group by a column whose type is registered under an Object.prototype name", () => {
  assert.throws(
    () =>
      validateKanbanOptions(
        "Cards",
        { columns: { photos: { type: new Named() } } },
        { groupByField: "photos" },
      ),
    /must be a non-multiple SelectType/,
  );
});
