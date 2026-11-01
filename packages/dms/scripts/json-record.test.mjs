import assert from "node:assert/strict";
import { test } from "node:test";
import {
  group,
  optionalText,
  parseJsonRecord,
  text,
  textAt,
} from "./helpers/json-record.mjs";

test("a path step into a text names an index only", () => {
  const node = parseJsonRecord('{"dms":{"title":"Hello","list":["a","b"]}}', "t");
  assert.equal(textAt(node, "dms.title.0"), "H");
  assert.equal(textAt(node, "dms.title.x"), undefined);
  assert.equal(textAt(node, "dms.title.length"), undefined);
  assert.equal(textAt(node, "dms.title.01"), undefined);
  assert.equal(textAt(node, "dms.list.1"), "b");
  assert.equal(textAt(node, "dms.list.at"), undefined);
});

test("a path step into an object names an own entry only", () => {
  const node = parseJsonRecord('{"dms":{"title":"Hello"}}', "t");
  assert.equal(textAt(node, "dms.title"), "Hello");
  assert.equal(textAt(node, "dms.constructor.name"), undefined);
});

test("a text entry of the wrong type is refused", () => {
  const node = parseJsonRecord('{"name":5}', "t");
  assert.throws(() => optionalText(node, "name"), TypeError);
  assert.throws(() => text(node, "name"), TypeError);
});

test("a missing text entry is refused by text and absent for optionalText", () => {
  const node = parseJsonRecord("{}", "t");
  assert.throws(() => text(node, "version"), TypeError);
  assert.equal(optionalText(node, "version"), undefined);
});

test("a JSON value that is not an object is refused", () => {
  assert.throws(() => parseJsonRecord("[]", "t"), TypeError);
  assert.throws(() => parseJsonRecord("null", "t"), TypeError);
  assert.throws(() => parseJsonRecord('"text"', "t"), TypeError);
});

test("a group that is missing or not an object is refused, and an own __proto__ entry is found", () => {
  assert.throws(() => group(parseJsonRecord("{}", "t"), "__proto__"), TypeError);
  assert.throws(() => group(parseJsonRecord('{"a":[]}', "t"), "a"), TypeError);
  const own = parseJsonRecord('{"__proto__":{"k":"v"}}', "t");
  assert.equal(text(group(own, "__proto__"), "k"), "v");
});
