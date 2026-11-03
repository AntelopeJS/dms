import assert from "node:assert/strict";
import test from "node:test";
import { buildWatchAction } from "../dist/internal/component-watches.js";

await test("a watch carries the params object it was given, untouched", () => {
  const params = { targetField: "costCenter", setHidden: true };
  const watch = buildWatchAction("fieldChange", "setFieldHidden", { params });
  assert.equal(watch.params, params);
  assert.deepEqual(params, { targetField: "costCenter", setHidden: true });
});

await test("a watch carries params of a class instance as given", () => {
  class Params {
    targetField = "costCenter";
  }
  const params = new Params();
  assert.equal(
    buildWatchAction("fieldChange", "setFieldHidden", { params }).params,
    params,
  );
});

await test("a watch given no params has no params key", () => {
  for (const opts of [undefined, {}, { params: undefined }]) {
    const watch = buildWatchAction("submitSuccess", "refreshPage", opts);
    assert.equal(Object.hasOwn(watch, "params"), false);
  }
});
