const assert = require("node:assert/strict");
const test = require("node:test");
const { GetMetadata } = require("@antelopejs/interface-core");
const { Searchable, SearchableMeta } = require("../dist/base/searchable");
const { hasSearchableFields } = require("../dist/base/internal/searchable");

test("a symbol-keyed @Searchable property is rejected instead of leaving an empty-but-present declaration", () => {
  class Controller {}
  const key = Symbol("hidden");

  assert.throws(() => Searchable()(Controller.prototype, key), TypeError);
  assert.equal(hasSearchableFields(Controller), false);
  assert.deepEqual(
    GetMetadata(Controller, SearchableMeta).getSearchableFields(),
    {},
  );
});

test("string-keyed @Searchable properties keep their compare mode", () => {
  class Controller {}

  Searchable()(Controller.prototype, "name");
  Searchable("is")(Controller.prototype, "status");

  assert.deepEqual(
    GetMetadata(Controller, SearchableMeta).getSearchableFields(),
    { name: "contains", status: "is" },
  );
  assert.equal(hasSearchableFields(Controller), true);
});
