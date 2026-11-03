import assert from "node:assert/strict";
import test from "node:test";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  createGuardedConfirmRoute,
  parseGuardBody,
} from "../dist/base/table-view/internal/guards.js";
import { TableViewMeta } from "../dist/base/table-view/meta.js";

const NOT_OBJECTS = ["null", "5", '"text"', "true", "[1]", "[]"];

const MAX_DEPTH = 64;
const TOO_DEEP = 10_000;

/**
 * A JSON object body that nests arrays or objects `levels` deep, the body
 * itself counted.
 *
 * @param {number} levels
 * @param {"array" | "object"} container
 */
const nestedBody = (levels, container) => {
  if (levels === 1) return "{}";
  if (container === "array") {
    return `{"k":${"[".repeat(levels - 1)}${"]".repeat(levels - 1)}}`;
  }
  return `${'{"k":'.repeat(levels - 1)}{}${"}".repeat(levels - 1)}`;
};

/** @param {() => unknown} run */
const refusal = (run) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

/**
 * @param {unknown} error
 * @param {string} label
 */
const assertRefusedAs400 = (error, label) => {
  assert.ok(error instanceof HTTPResult, `${label}: ${String(error)}`);
  assert.equal(error.getStatus(), 400, label);
  assert.match(String(error.getBody()), /64/, label);
};

await test("a JSON object body decodes to its fields, as text or bytes", () => {
  const text = '{"title":"Plan","count":2}';
  assert.deepEqual(parseGuardBody(text), { title: "Plan", count: 2 });
  assert.deepEqual(parseGuardBody(Buffer.from(text)), {
    title: "Plan",
    count: 2,
  });
});

await test("nested JSON values keep their shape through the decoder", () => {
  const text =
    '{"list":[1,{"flag":true,"none":null}],"inner":{"deep":["x",[]]}}';
  const expected = {
    list: [1, { flag: true, none: null }],
    inner: { deep: ["x", []] },
  };
  assert.deepEqual(parseGuardBody(text), expected);
  assert.deepEqual(parseGuardBody(Buffer.from(text)), expected);
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

for (const container of ["array", "object"]) {
  await test(`a body nested ${TOO_DEEP} ${container} levels deep answers 400, as text or bytes`, () => {
    const body = nestedBody(TOO_DEEP, container);
    assertRefusedAs400(
      refusal(() => parseGuardBody(body)),
      "text",
    );
    assertRefusedAs400(
      refusal(() => parseGuardBody(Buffer.from(body))),
      "bytes",
    );
  });

  await test(`a body nested ${MAX_DEPTH} ${container} levels deep is still decoded whole`, () => {
    const body = nestedBody(MAX_DEPTH, container);
    assert.equal(JSON.stringify(parseGuardBody(body)), body);
    assert.equal(JSON.stringify(parseGuardBody(Buffer.from(body))), body);
  });

  await test(`a body nested ${MAX_DEPTH + 1} ${container} levels deep answers 400`, () => {
    assertRefusedAs400(
      refusal(() => parseGuardBody(nestedBody(MAX_DEPTH + 1, container))),
      "one past the bound",
    );
  });
}

await test("a confirmation body nested too deep answers 400 before the guard runs", async () => {
  class GuardedController {}
  const calls = [];
  GetMetadata(GuardedController, TableViewMeta).setControllerGuards({
    delete: () => void calls.push("guard"),
  });
  const guarded = createGuardedConfirmRoute(
    { func: async () => calls.push("write"), args: [], method: "delete" },
    "delete",
  );
  /** @param {string} body */
  const run = (body) =>
    guarded.func.call(
      new GuardedController(),
      {},
      { id: ["row-1"] },
      Buffer.from(body),
    );
  await assert.rejects(run(nestedBody(TOO_DEEP, "array")), (error) => {
    assertRefusedAs400(error, "deep confirmation");
    return true;
  });
  assert.deepEqual(calls, []);
  await run(nestedBody(MAX_DEPTH, "array"));
  assert.deepEqual(calls, ["guard", "write"]);
});

await test("a nested JSON key named __proto__ is dropped, as the top-level one is", () => {
  const text =
    '{"inner":{"__proto__":{"admin":true},"title":"Plan"},"list":[{"__proto__":1,"n":2}]}';
  for (const body of [text, Buffer.from(text)]) {
    const fields = parseGuardBody(body);
    assert.deepEqual(fields, {
      inner: { title: "Plan" },
      list: [{ n: 2 }],
    });
    assert.equal(Object.getPrototypeOf(fields.inner), Object.prototype);
    assert.equal(fields.inner.admin, undefined);
  }
});
