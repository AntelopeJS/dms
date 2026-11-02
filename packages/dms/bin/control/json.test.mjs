import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  arrayOf,
  decode,
  firstString,
  instanceOf,
  isNumber,
  isRecord,
  isString,
  nullable,
  objectOf,
  oneOf,
  readRecordList,
  recordOf,
  stringField,
} from "./json.mjs";

await test("an object is a record, an array, null and a string are not", () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord("text"), false);
});

await test("a string field answers only an own string property", () => {
  assert.equal(stringField({ access_token: "abc" }, "access_token"), "abc");
  assert.equal(stringField({ access_token: 4 }, "access_token"), undefined);
  assert.equal(stringField({}, "access_token"), undefined);
  assert.equal(stringField(["abc"], "0"), undefined);
  assert.equal(stringField(null, "access_token"), undefined);
});

await test("a string field never answers an inherited property", () => {
  assert.equal(stringField({}, "constructor"), undefined);
  assert.equal(stringField({}, "toString"), undefined);
});

await test("the first string of a list is its first element only", () => {
  assert.equal(firstString(["user-1", "user-2"]), "user-1");
  assert.equal(firstString([4, "user-2"]), undefined);
  assert.equal(firstString([]), undefined);
  assert.equal(firstString({ 0: "user-1" }), undefined);
});

/**
 * @param {import("node:test").TestContext} t The test
 * @param {string} text What the file holds
 * @returns {string} The file
 */
function jsonFile(t, text) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-json-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "list.json");
  writeFileSync(file, text);
  return file;
}

await test("a list of objects is read as written", (t) => {
  const file = jsonFile(t, '[{"journey":"smoke","extra":1},{}]');
  assert.deepEqual(readRecordList(file), [{ journey: "smoke", extra: 1 }, {}]);
});

await test("a file that is not a list of objects is refused", (t) => {
  for (const text of ["{}", "null", "[1]", "[null]", "[[]]"]) {
    assert.throws(
      () => readRecordList(jsonFile(t, text)),
      /is not a list of objects/,
      text,
    );
  }
});

await test("a file that is not JSON is refused", (t) => {
  assert.throws(() => readRecordList(jsonFile(t, "[")), SyntaxError);
});

await test("an object guard checks required and optional properties and keeps the rest", () => {
  const guard = objectOf({ name: isString }, { count: isNumber });
  assert.equal(guard({ name: "a" }), true);
  assert.equal(guard({ name: "a", count: 2, extra: true }), true);
  assert.equal(guard({ name: "a", count: "2" }), false);
  assert.equal(guard({ count: 2 }), false);
  assert.equal(guard([]), false);
  assert.equal(guard(null), false);
});

await test("an object guard never counts an inherited property", () => {
  assert.equal(objectOf({ constructor: isString })({}), false);
  assert.equal(objectOf({}, { toString: isString })({}), true);
});

await test("list, record, nullable and name guards check what they hold", () => {
  assert.equal(arrayOf(isString)(["a", 1]), false);
  assert.equal(arrayOf(isString)([]), true);
  assert.equal(recordOf(isNumber)({ a: 1, b: "x" }), false);
  assert.equal(nullable(isString)(null), true);
  assert.equal(nullable(isString)(3), false);
  assert.equal(oneOf(["PASS", "FAIL"])("PASSED"), false);
  assert.equal(instanceOf(RegExp)(/x/), true);
  assert.equal(instanceOf(RegExp)("x"), false);
});

await test("decode returns a value that passes and names the source of one that does not", () => {
  const value = { name: "a" };
  assert.equal(
    decode(objectOf({ name: isString }), value, "x.json", "a thing"),
    value,
  );
  assert.throws(
    () => decode(objectOf({ name: isString }), {}, "x.json", "a thing"),
    /x\.json is malformed: expected a thing/,
  );
});
