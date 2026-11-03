import assert from "node:assert/strict";
import test from "node:test";
import { parseValue } from "../dist/utils/internal/value-parser.js";

await test("a JSON object, array or quoted string parses to the value it holds", () => {
  assert.deepEqual(parseValue('{"key":"value","n":[1,{"a":null}]}'), {
    key: "value",
    n: [1, { a: null }],
  });
  assert.deepEqual(parseValue("[1,2,3]"), [1, 2, 3]);
  assert.equal(parseValue('"quoted"'), "quoted");
});

await test("text that is not JSON, a keyword, a number or a date stays text", () => {
  assert.equal(parseValue("(x) => x * 2"), "(x) => x * 2");
  assert.equal(parseValue("not a number"), "not a number");
  assert.equal(parseValue("true"), true);
  assert.equal(parseValue("42"), 42);
});
