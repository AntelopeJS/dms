import assert from "node:assert/strict";
import { test } from "node:test";
import { assertRejected, fixturePath } from "./fixtures.mjs";

await test("a rejected fixture that expects no diagnostic is refused before any scan", () => {
  assert.throws(
    () => assertRejected("forbidden", [[fixturePath("src"), "export {};", 0]]),
    assert.AssertionError,
  );
});

await test("a rejected batch is refused when a fixture reports a kind it did not declare", () => {
  assert.throws(
    () =>
      assertRejected("forbidden", [
        [fixturePath("src"), "import(unknownSpecifier);"],
      ]),
    assert.AssertionError,
  );
});
