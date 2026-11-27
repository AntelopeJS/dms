import assert from "node:assert/strict";
import test from "node:test";
import { brandClass } from "../dist/utils/internal/brand.js";
import { Action, IsAction } from "../dist/component.js";
import { IsUser, User } from "../dist/auth/db/tables/users.table.js";
import {
  IsTableViewMeta,
  TableViewMeta,
} from "../dist/base/table-view/meta.js";
import {
  IsTenantLifecycleReleaseError,
  TenantLifecycleReleaseError,
} from "../dist/tenant-lifecycle.js";

/**
 * @param {(value: unknown) => boolean} guard
 * @param {object} instance
 */
function assertGuards(guard, instance) {
  assert.equal(guard(instance), true);
  assert.equal(guard(Object.assign({}, instance)), false);
  assert.equal(guard(null), false);
  assert.equal(guard("instance"), false);
}

await test("a guard accepts an instance built by another copy of the class, which instanceof refuses", () => {
  class Local {}
  class OtherCopy {}
  const isLocal = brandClass(Local, "BrandGuardsTest");
  brandClass(OtherCopy, "BrandGuardsTest");
  const foreign = new OtherCopy();
  assert.equal(foreign instanceof Local, false);
  assert.equal(isLocal(foreign), true);
});

await test("a guard accepts an object whose prototype chain reaches an instance", () => {
  assert.equal(IsUser(Object.create(new User())), true);
});

await test("IsAction accepts an Action and refuses a copy of its fields", () => {
  assertGuards(IsAction, new Action("view", { title: "View" }, {}));
});

await test("IsUser accepts a User and refuses a copy of its fields", () => {
  assertGuards(IsUser, new User());
});

await test("IsTableViewMeta accepts a TableViewMeta and refuses a copy of its fields", () => {
  assertGuards(IsTableViewMeta, new TableViewMeta(class {}));
});

await test("IsTenantLifecycleReleaseError accepts the error and refuses a copy of its fields", () => {
  assertGuards(
    IsTenantLifecycleReleaseError,
    new TenantLifecycleReleaseError("t", "a", null),
  );
});

await test("the brand stays off the instance's own keys", () => {
  const user = new User();
  assert.deepEqual(Object.getOwnPropertySymbols(user), []);
  assert.equal(JSON.stringify(user), "{}");
});
