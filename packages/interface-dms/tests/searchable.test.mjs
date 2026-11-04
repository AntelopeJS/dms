import assert from "node:assert/strict";
import test from "node:test";
import { GetMetadata } from "@antelopejs/interface-core";
import { Searchable, SearchableMeta } from "../dist/base/searchable.js";
import { hasSearchableFields } from "../dist/base/internal/searchable.js";

await test("a symbol-keyed @Searchable property is rejected instead of leaving an empty-but-present declaration", () => {
  class Controller {}
  const key = Symbol("hidden");

  assert.throws(() => Searchable()(Controller.prototype, key), TypeError);
  assert.equal(hasSearchableFields(Controller), false);
  assert.deepEqual(
    GetMetadata(Controller, SearchableMeta).getSearchableFields(),
    {},
  );
});

await test("string-keyed @Searchable properties keep their compare mode", () => {
  class Controller {}

  Searchable()(Controller.prototype, "name");
  Searchable("is")(Controller.prototype, "status");

  assert.deepEqual(
    GetMetadata(Controller, SearchableMeta).getSearchableFields(),
    { name: "contains", status: "is" },
  );
  assert.equal(hasSearchableFields(Controller), true);
});
