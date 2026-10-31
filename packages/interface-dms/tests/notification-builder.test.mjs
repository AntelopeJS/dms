import assert from "node:assert/strict";
import test from "node:test";
import { NotificationBuilder } from "../dist/notifications/builder.js";

const subject = {
  id: "s",
  category: { id: "c", labelKey: "c.label", icon: "i-ph-bell" },
  labelKey: "s.label",
};

await test("a builder whose generic was supplied by the caller still refuses to build without the required fields", () => {
  assert.throws(
    () => new NotificationBuilder().build(),
    /icon, title, description, subject/,
  );
});

await test("build names only the required fields that are still missing", () => {
  assert.throws(
    () => new NotificationBuilder().icon("i").title("t").build(),
    /description, subject$/,
  );
});

await test("an undefined value does not count as supplying a required field", () => {
  const builder = new NotificationBuilder()
    .icon("i")
    .title(undefined)
    .description("d")
    .subject(subject);
  assert.throws(() => builder.build(), /title$/);
});

await test("a builder with every required field builds, optional fields stay optional", () => {
  const builder = new NotificationBuilder()
    .icon("i")
    .title("t")
    .description("d")
    .subject(subject);
  assert.doesNotThrow(() => builder.build());
});
