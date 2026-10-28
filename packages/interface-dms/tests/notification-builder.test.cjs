const assert = require("node:assert/strict");
const test = require("node:test");
const { NotificationBuilder } = require("../dist/notifications/builder");

const subject = {
  id: "s",
  category: { id: "c", labelKey: "c.label", icon: "i-ph-bell" },
  labelKey: "s.label",
};

test("a builder whose generic was supplied by the caller still refuses to build without the required fields", () => {
  assert.throws(
    () => new NotificationBuilder().build(),
    /icon, title, description, subject/,
  );
});

test("build names only the required fields that are still missing", () => {
  assert.throws(
    () => new NotificationBuilder().icon("i").title("t").build(),
    /description, subject$/,
  );
});

test("an undefined value does not count as supplying a required field", () => {
  const builder = new NotificationBuilder()
    .icon("i")
    .title(undefined)
    .description("d")
    .subject(subject);
  assert.throws(() => builder.build(), /title$/);
});

test("a builder with every required field builds, optional fields stay optional", () => {
  const builder = new NotificationBuilder()
    .icon("i")
    .title("t")
    .description("d")
    .subject(subject);
  assert.doesNotThrow(() => builder.build());
});
