import assert from "node:assert/strict";
import test from "node:test";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  createGuardedConfirmRoute,
  parseGuardBody,
} from "../dist/base/table-view/internal/guards.js";
import { TableViewMeta } from "../dist/base/table-view/meta.js";

const NOT_OBJECTS = ["null", "5", '"text"', "true", "[1]", "[]"];

await test("a JSON object body decodes to its fields, as text or bytes", () => {
  const text = '{"title":"Plan","count":2}';
  assert.deepEqual(parseGuardBody(text), { title: "Plan", count: 2 });
  assert.deepEqual(parseGuardBody(Buffer.from(text)), {
    title: "Plan",
    count: 2,
  });
});

await test("a body that is already decoded, or absent, keeps its answers", () => {
  const decoded = { title: "Plan" };
  assert.equal(parseGuardBody(decoded), decoded);
  assert.deepEqual(parseGuardBody(""), {});
  assert.deepEqual(parseGuardBody(undefined), {});
  assert.deepEqual(parseGuardBody(null), {});
});

await test("malformed JSON is still refused", () => {
  assert.throws(() => parseGuardBody("{"), SyntaxError);
  assert.throws(() => parseGuardBody(Buffer.from("{")), SyntaxError);
});

await test("a JSON body that is not an object is refused, as text or bytes", () => {
  for (const body of NOT_OBJECTS) {
    assert.throws(() => parseGuardBody(body), TypeError, body);
    assert.throws(() => parseGuardBody(Buffer.from(body)), TypeError, body);
  }
});

await test("a confirmation body that is not an object is refused before the guard runs", async () => {
  class GuardedController {}
  const calls = [];
  GetMetadata(GuardedController, TableViewMeta).setControllerGuards({
    delete: () => void calls.push("guard"),
  });
  const guarded = createGuardedConfirmRoute(
    { func: async () => calls.push("write"), args: [], method: "delete" },
    "delete",
  );
  for (const body of NOT_OBJECTS) {
    await assert.rejects(
      guarded.func.call(
        new GuardedController(),
        {},
        { id: ["row-1"] },
        Buffer.from(body),
      ),
      TypeError,
      body,
    );
  }
  assert.deepEqual(calls, []);
});

await test("a JSON key named __proto__ is not carried into the decoded fields", () => {
  const fields = parseGuardBody('{"__proto__":{"admin":true},"title":"Plan"}');
  assert.deepEqual(Object.keys(fields), ["title"]);
  assert.equal(Object.getPrototypeOf(fields), Object.prototype);
});
