import assert from "node:assert/strict";
import { test } from "node:test";
import { runWithLocales } from "./helpers/backend-checks-tree.mjs";

/**
 * @type {readonly [string, (messages: import("./helpers/backend-checks-tree.mjs").LocaleFile) => void][]}
 */
const acceptedLocales = [
  ["the shipped locale files", () => {}],
  [
    "an array message under a key the check never reads",
    (messages) => {
      messages.zzList = ["a", "b"];
    },
  ],
  [
    "a number under a key the check never reads",
    (messages) => {
      messages.zzCount = 3;
    },
  ],
  [
    "a boolean and a null under keys the check never reads",
    (messages) => {
      messages.zzFlag = true;
      messages.zzNothing = null;
    },
  ],
  [
    "an array nested in a group the check never reads",
    (messages) => {
      messages.zzGroup = { items: ["a", { deeper: [1, 2] }] };
    },
  ],
];

for (const [name, edit] of acceptedLocales) {
  await test(`backend-checks: passes with ${name}`, () => {
    const { status, stdout, stderr } = runWithLocales(edit);
    assert.equal(stderr, "");
    assert.equal(stdout.trim(), "Backend invariant checks passed.");
    assert.equal(status, 0);
  });
}

await test("backend-checks: still fails when a key it reads is missing", () => {
  const { status, stderr } = runWithLocales((messages) => {
    delete messages.error.tenant_owner_required;
  });
  assert.equal(status, 1);
  assert.match(stderr, /must translate error\.tenant_owner_required/);
});

await test("backend-checks: still fails when a key it reads holds an array", () => {
  const { status, stderr } = runWithLocales((messages) => {
    messages.error.tenant_owner_required = ["a"];
  });
  assert.equal(status, 1);
  assert.match(stderr, /must translate error\.tenant_owner_required/);
});
