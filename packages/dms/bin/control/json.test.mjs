import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { firstString, isRecord, readRecordList, stringField } from "./json.mjs";

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
