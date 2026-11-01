import assert from "node:assert/strict";
import { test } from "node:test";
import { runWithLocales } from "./helpers/backend-checks-tree.mjs";
import { group } from "./helpers/json-record.mjs";

/**
 * @type {readonly [string, (messages: import("./helpers/backend-checks-tree.mjs").LocaleFile) => void][]}
 */
const acceptedLocales = [
  ["the shipped locale files", () => {}],
  [
    "an array message under a key the check never reads",
    (messages) => {
      messages.testOnlyList = ["a", "b"];
    },
  ],
  [
    "a number under a key the check never reads",
    (messages) => {
      messages.testOnlyCount = 3;
    },
  ],
  [
    "a boolean and a null under keys the check never reads",
    (messages) => {
      messages.testOnlyFlag = true;
      messages.testOnlyNothing = null;
    },
  ],
  [
    "an array nested in a group the check never reads",
    (messages) => {
      messages.testOnlyGroup = { items: ["a", { deeper: [1, 2] }] };
    },
  ],
];

for (const [name, edit] of acceptedLocales) {
  await test(`backend-checks: passes with ${name}`, () => {
    const { status, stdout } = runWithLocales(edit);
    assert.equal(status, 0);
    assert.match(stdout, /Backend invariant checks passed\./);
  });
}

await test("backend-checks: still fails when a key it reads is missing", () => {
  const { status, stderr } = runWithLocales((messages) => {
    delete group(messages, "error").tenant_owner_required;
  });
  assert.equal(status, 1);
  assert.match(stderr, /must translate error\.tenant_owner_required/);
});

await test("backend-checks: still fails when a key it reads holds an array", () => {
  const { status, stderr } = runWithLocales((messages) => {
    group(messages, "error").tenant_owner_required = ["a"];
  });
  assert.equal(status, 1);
  assert.match(stderr, /must translate error\.tenant_owner_required/);
});

/**
 * The `dms.automation` group of a locale file.
 * @param {import("./helpers/backend-checks-tree.mjs").LocaleFile} messages
 */
const automation = (messages) => group(group(messages, "dms"), "automation");

/**
 * Translate a label named __proto__ in a group of the locale file that the
 * extra trigger's title points at.
 * @param {import("./helpers/backend-checks-tree.mjs").LocaleFile} messages
 * @param {string} value
 * @returns {void}
 */
function translateProtoField(messages, value) {
  const labels = {};
  Object.defineProperty(labels, "__proto__", {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  automation(messages).testOnlyLabels = labels;
}

await test("backend-checks: a field named __proto__ passes once both locales translate it", () => {
  const { status, stdout } = runWithLocales(
    (messages) => {
      translateProtoField(messages, "Prototype");
    },
    { outputField: "__proto__" },
  );
  assert.equal(status, 0);
  assert.match(stdout, /Backend invariant checks passed\./);
});

await test("backend-checks: a field named __proto__ fails while no locale translates it", () => {
  const { status, stderr } = runWithLocales(
    (messages) => {
      delete automation(messages).testOnlyLabels;
    },
    { outputField: "__proto__" },
  );
  assert.equal(status, 1);
  assert.match(
    stderr,
    /must translate dms\.automation\.testOnlyLabels\.__proto__/,
  );
});

await test("backend-checks: a node text reaching constructor.name passes as on base", () => {
  const { status, stdout } = runWithLocales(() => {}, {
    name: "$dms.automation.constructor.name",
  });
  assert.equal(status, 0);
  assert.match(stdout, /Backend invariant checks passed\./);
});

await test("backend-checks: a node text indexing a string message passes as on base", () => {
  const { status, stdout } = runWithLocales(
    (messages) => {
      automation(messages).testOnlyText = "Text";
    },
    { name: "$dms.automation.testOnlyText.0" },
  );
  assert.equal(status, 0);
  assert.match(stdout, /Backend invariant checks passed\./);
});

await test("backend-checks: a node text indexing a missing message still fails", () => {
  const { status, stderr } = runWithLocales(
    (messages) => {
      delete automation(messages).testOnlyText;
    },
    { name: "$dms.automation.testOnlyText.0" },
  );
  assert.equal(status, 1);
  assert.match(stderr, /must translate dms\.automation\.testOnlyText\.0/);
});

await test("backend-checks: an engines entry of another tool that is not a string passes as on base", () => {
  const { status, stdout } = runWithLocales(
    () => {},
    {},
    (manifest) => {
      group(manifest, "engines").node = 20;
    },
  );
  assert.equal(status, 0);
  assert.match(stdout, /Backend invariant checks passed\./);
});

await test("backend-checks: still fails when the renderer range is missing", () => {
  const { status, stderr } = runWithLocales(
    () => {},
    {},
    (manifest) => {
      delete group(manifest, "engines")["@antelopejs/dms-frontend"];
    },
  );
  assert.equal(status, 1);
  assert.match(stderr, /frontend-vue renderer range/);
});
