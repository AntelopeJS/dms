import assert from "node:assert/strict";
import test from "node:test";
import { ComponentBuilder } from "../dist/component.js";

await test("a watchFilter callback runs with the builder as this", async () => {
  const builder = new ComponentBuilder("P");
  let receiverIsBuilder = false;
  builder.watchFilter(function () {
    receiverIsBuilder = this === builder;
    return [];
  });
  await builder.onFilterCallback(
    new Set(),
    { watchActions: [{ id: "a" }] },
    "perm",
    {},
  );
  assert.equal(receiverIsBuilder, true);
});
