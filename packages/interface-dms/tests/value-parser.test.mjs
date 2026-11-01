import assert from "node:assert/strict";
import test from "node:test";
import { parseValue } from "../dist/utils/internal/value-parser.js";
import { rowRuleProblem } from "../dist/base/table-view/internal/row-rule-shape.js";

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

await test("a row rule is checked on the first logical operator it holds", () => {
  assert.equal(rowRuleProblem({ and: [{ field: "a", equals: 1 }] }), undefined);
  assert.equal(
    rowRuleProblem({ and: { field: "a", equals: 1 } }),
    "rule.and must be an array of rules",
  );
  assert.equal(
    rowRuleProblem({ not: [{ field: "a", equals: 1 }] }),
    "rule.not must be a rule object",
  );
  assert.equal(
    rowRuleProblem({ field: "a", in: 1 }),
    "rule.in must be an array",
  );
  assert.equal(rowRuleProblem(null), "rule must be a rule object");
});
