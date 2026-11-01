import assert from "node:assert/strict";
import test from "node:test";
import { ruleFields } from "../dist/base/table-view/internal/footer.js";

await test("the columns of a row rule are read through nested operators, an absent operand adding none", () => {
  const field = (name) => ({ field: name, equals: 1 });
  assert.deepEqual(ruleFields(field("a")), ["a"]);
  assert.deepEqual(
    ruleFields({ and: [field("a"), { or: [field("b")] }], not: field("c") }),
    ["a", "b", "c"],
  );
  assert.deepEqual(ruleFields({ and: [field("a")], not: undefined }), ["a"]);
});
