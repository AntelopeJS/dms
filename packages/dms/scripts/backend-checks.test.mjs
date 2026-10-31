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
  group(group(messages, "dms"), "automation").zzFields = labels;
}

await test("backend-checks: a field named __proto__ passes once both locales translate it", () => {
  const { status, stdout, stderr } = runWithLocales(
    (messages) => {
      translateProtoField(messages, "Prototype");
    },
    { outputField: "__proto__" },
  );
  assert.equal(stderr, "");
  assert.equal(stdout.trim(), "Backend invariant checks passed.");
  assert.equal(status, 0);
});

await test("backend-checks: a field named __proto__ fails while no locale translates it", () => {
  const { status, stderr } = runWithLocales(() => {}, {
    outputField: "__proto__",
  });
  assert.equal(status, 1);
  assert.match(stderr, /must translate dms\.automation\.zzFields\.__proto__/);
});

await test("backend-checks: a node text reaching constructor.name passes as on base", () => {
  const { status, stdout, stderr } = runWithLocales(() => {}, {
    name: "$dms.automation.constructor.name",
  });
  assert.equal(stderr, "");
  assert.equal(stdout.trim(), "Backend invariant checks passed.");
  assert.equal(status, 0);
});

await test("backend-checks: a node text indexing a string message passes as on base", () => {
  const { status, stdout, stderr } = runWithLocales(
    (messages) => {
      group(group(messages, "dms"), "automation").zz = "Text";
    },
    { name: "$dms.automation.zz.0" },
  );
  assert.equal(stderr, "");
  assert.equal(stdout.trim(), "Backend invariant checks passed.");
  assert.equal(status, 0);
});

await test("backend-checks: a node text indexing a missing message still fails", () => {
  const { status, stderr } = runWithLocales(() => {}, {
    name: "$dms.automation.zz.0",
  });
  assert.equal(status, 1);
  assert.match(stderr, /must translate dms\.automation\.zz\.0/);
});

await test("backend-checks: an engines entry of another tool that is not a string passes as on base", () => {
  const { status, stdout, stderr } = runWithLocales(
    () => {},
    {},
    (manifest) => {
      group(manifest, "engines").node = 20;
    },
  );
  assert.equal(stderr, "");
  assert.equal(stdout.trim(), "Backend invariant checks passed.");
  assert.equal(status, 0);
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
