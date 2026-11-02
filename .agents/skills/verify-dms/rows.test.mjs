import assert from "node:assert/strict";
import test from "node:test";
import { booleanIn, isInviteRow, isMemberRow, isNotificationRow, isRoleOverviewRow, isRoleRow, isStoreModule, isUserRow, issuePaths, listIn, listOf, numberIn, rowsOf, requiredStringIn, stringIn, stringsIn } from "./rows.mjs";

const MEMBER = { _id: "default:u1", email: "a@example.com", name: "Ada", isTenantOwner: true, roleIds: [{ _id: "r1" }] };
const INVITE = { _id: "i1", email: "b@example.com", asTenantOwner: false, roles_ids: [{ _id: "r1" }] };
const ROLE = { _id: "r1", name: "Editor", permissions: ["a.b"] };
const USER = { _id: "u1", name: "Ada", email: "a@example.com" };

await test("each row guard accepts the shape the data API lists and the fields a journey leaves out", () => {
  assert.equal(isMemberRow(MEMBER), true);
  assert.equal(isMemberRow({ _id: "m", email: "e" }), true);
  assert.equal(isInviteRow(INVITE), true);
  assert.equal(isInviteRow({ _id: "i", email: "e" }), true);
  assert.equal(isRoleRow(ROLE), true);
  assert.equal(isRoleRow({ _id: "r", name: "n" }), true);
  assert.equal(isUserRow(USER), true);
  assert.equal(isRoleOverviewRow({ _id: "r1", inviteCount: 1, memberCount: 0 }), true);
  assert.equal(isRoleOverviewRow({ _id: "r1" }), true);
  assert.equal(isStoreModule({ id: "api", state: "available" }), true);
});

await test("each row guard refuses a value that is not that row", () => {
  assert.equal(isMemberRow(null), false);
  assert.equal(isMemberRow("default:u1"), false);
  assert.equal(isMemberRow([MEMBER]), false);
  assert.equal(isMemberRow({ ...MEMBER, _id: 7 }), false);
  assert.equal(isMemberRow({ ...MEMBER, email: undefined }), false);
  assert.equal(isMemberRow({ ...MEMBER, isTenantOwner: "yes" }), false);
  assert.equal(isMemberRow({ ...MEMBER, roleIds: ["r1"] }), false);
  assert.equal(isMemberRow({ ...MEMBER, roleIds: "r1" }), false);
  assert.equal(isInviteRow({ ...INVITE, asTenantOwner: 1 }), false);
  assert.equal(isInviteRow({ ...INVITE, roles_ids: [{}] }), false);
  assert.equal(isRoleRow({ ...ROLE, name: undefined }), false);
  assert.equal(isRoleRow({ ...ROLE, permissions: "a.b" }), false);
  assert.equal(isRoleRow({ ...ROLE, permissions: [1] }), false);
  assert.equal(isUserRow({ _id: "u1", name: "Ada" }), false);
  assert.equal(isRoleOverviewRow({ _id: "r1", inviteCount: "1" }), false);
  assert.equal(isStoreModule({ id: "api", state: 3 }), false);
});

await test("listOf returns the rows of a list answer", () => {
  assert.deepEqual(listOf({ results: [MEMBER, { _id: "m2", email: "c@example.com" }] }, isMemberRow), [MEMBER, { _id: "m2", email: "c@example.com" }]);
  assert.deepEqual(listOf({ results: [] }, isMemberRow), []);
});

await test("listOf answers an empty list when the answer holds no list, as an error answer does", () => {
  assert.deepEqual(listOf(undefined, isMemberRow), []);
  assert.deepEqual(listOf(null, isMemberRow), []);
  assert.deepEqual(listOf("error.forbidden", isMemberRow), []);
  assert.deepEqual(listOf({}, isMemberRow), []);
  assert.deepEqual(listOf({ results: null }, isMemberRow), []);
  assert.deepEqual(listOf([MEMBER], isMemberRow), []);
});

await test("listOf refuses a malformed list instead of passing it on", () => {
  assert.throws(() => listOf({ results: {} }, isMemberRow), /results/);
  assert.throws(() => listOf({ results: "none" }, isMemberRow), /results/);
  assert.throws(() => listOf({ results: 0 }, isMemberRow), /results/);
  assert.throws(() => listOf({ results: [MEMBER, { _id: "m2" }] }, isMemberRow), /results\[1\]/);
  assert.throws(() => listOf({ results: [null] }, isRoleRow), /results\[0\]/);
});

await test("listOf does not read a list from an inherited key", () => {
  assert.deepEqual(listOf(Object.create({ results: [MEMBER] }), isMemberRow), []);
});

await test("listIn reads the list under the key it is given", () => {
  assert.deepEqual(listIn({ roles: [{ _id: "r1", inviteCount: 1 }] }, "roles", isRoleOverviewRow), [{ _id: "r1", inviteCount: 1 }]);
  assert.deepEqual(listIn({ results: [MEMBER] }, "roles", isRoleOverviewRow), []);
  assert.throws(() => listIn({ roles: "r1" }, "roles", isRoleOverviewRow), /roles/);
});

await test("stringIn reads a string field and leaves an absent one undefined", () => {
  assert.equal(stringIn({ access_token: "tok" }, "access_token"), "tok");
  assert.equal(stringIn({ access_token: "" }, "access_token"), "");
  assert.equal(stringIn({}, "access_token"), undefined);
  assert.equal(stringIn({ access_token: null }, "access_token"), undefined);
  assert.equal(stringIn(undefined, "access_token"), undefined);
  assert.equal(stringIn("error.forbidden", "access_token"), undefined);
  assert.equal(stringIn(Object.create({ access_token: "tok" }), "access_token"), undefined);
});

await test("stringIn refuses a field that is present and not a string", () => {
  assert.throws(() => stringIn({ access_token: 5 }, "access_token"), /access_token/);
  assert.throws(() => stringIn({ access_token: { token: "tok" } }, "access_token"), /access_token/);
  assert.throws(() => stringIn({ access_token: false }, "access_token"), /access_token/);
});

await test("requiredStringIn refuses an absent field", () => {
  assert.equal(requiredStringIn({ id: "r1" }, "id"), "r1");
  assert.throws(() => requiredStringIn({}, "id"), /id/);
  assert.throws(() => requiredStringIn("error.forbidden", "id"), /id/);
  assert.throws(() => requiredStringIn({ id: 1 }, "id"), /id/);
});

await test("stringsIn reads a list of strings and refuses anything else present", () => {
  assert.deepEqual(stringsIn({ hiddenEntries: ["a", "b"] }, "hiddenEntries"), ["a", "b"]);
  assert.deepEqual(stringsIn({}, "hiddenEntries"), []);
  assert.deepEqual(stringsIn(undefined, "hiddenEntries"), []);
  assert.throws(() => stringsIn({ hiddenEntries: "a" }, "hiddenEntries"), /hiddenEntries/);
  assert.throws(() => stringsIn({ hiddenEntries: ["a", 2] }, "hiddenEntries"), /hiddenEntries\[1\]/);
});

await test("numberIn reads a number field and refuses a present value that is not one", () => {
  assert.equal(numberIn({ all: 3 }, "all"), 3);
  assert.equal(numberIn({ all: 0 }, "all"), 0);
  assert.equal(numberIn({}, "all"), undefined);
  assert.equal(numberIn(null, "all"), undefined);
  assert.throws(() => numberIn({ all: "3" }, "all"), /all/);
  assert.throws(() => numberIn({ all: Number.NaN }, "all"), /all/);
});

await test("issuePaths names the field of each validation issue and leaves other answers empty", () => {
  assert.deepEqual(issuePaths([{ path: ["email"], message: "bad" }, { path: ["address", "street"] }]), ["email", "address.street"]);
  assert.deepEqual(issuePaths([{ message: "no path" }]), [undefined]);
  assert.deepEqual(issuePaths("error.admin_already_set"), []);
  assert.deepEqual(issuePaths(undefined), []);
  assert.deepEqual(issuePaths({ path: ["email"] }), []);
  assert.throws(() => issuePaths([{ path: "email" }]), /path/);
  assert.throws(() => issuePaths([{ path: [{}] }]), /path/);
});

await test("booleanIn reads a boolean field and refuses a present value that is not one", () => {
  assert.equal(booleanIn({ owner: true }, "owner"), true);
  assert.equal(booleanIn({ owner: false }, "owner"), false);
  assert.equal(booleanIn({}, "owner"), undefined);
  assert.equal(booleanIn(null, "owner"), undefined);
  assert.equal(booleanIn("error.forbidden", "owner"), undefined);
  assert.throws(() => booleanIn({ owner: "true" }, "owner"), /owner/);
  assert.throws(() => booleanIn({ owner: 1 }, "owner"), /owner/);
});

await test("the scalar readers never answer a key the body inherits", () => {
  assert.equal(booleanIn({}, "constructor"), undefined);
  assert.equal(booleanIn({}, "toString"), undefined);
});

await test("isNotificationRow accepts the fields the shell journey reads and refuses a mistyped one", () => {
  assert.equal(isNotificationRow({ icon: "i-ph-sign-in", linkTo: "/settings/user/security", isRead: false }), true);
  assert.equal(isNotificationRow({}), true);
  assert.equal(isNotificationRow(null), false);
  assert.equal(isNotificationRow([]), false);
  assert.equal(isNotificationRow({ icon: 3 }), false);
  assert.equal(isNotificationRow({ linkTo: {} }), false);
  assert.equal(isNotificationRow({ isRead: "no" }), false);
});

await test("rowsOf reads a body that is itself a list and refuses a malformed one", () => {
  const row = { icon: "i" };
  assert.deepEqual(rowsOf([row, {}], isNotificationRow), [row, {}]);
  assert.deepEqual(rowsOf("error.forbidden", isNotificationRow), []);
  assert.deepEqual(rowsOf(undefined, isNotificationRow), []);
  assert.deepEqual(rowsOf({ results: [row] }, isNotificationRow), []);
  assert.throws(() => rowsOf([row, { icon: 3 }], isNotificationRow), /\[1\]/);
});
