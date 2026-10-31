import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureExamples,
  generateCatalog,
} from "./helpers/docs-scripts-tree.mjs";

/**
 * The third entry is the `dmsVersion` entries the catalogue must hold, or
 * `undefined` for the version the package.json written to the scratch root has.
 * @type {readonly [string, (manifest: Record<string, unknown>) => void, [string, unknown][] | undefined][]}
 */
const manifests = [
  ["the shipped package.json", () => {}, undefined],
  [
    "a package.json without a version",
    (manifest) => {
      delete manifest.version;
    },
    [],
  ],
  [
    "a numeric version",
    (manifest) => {
      manifest.version = 5;
    },
    [["dmsVersion", 5]],
  ],
  [
    "a null version",
    (manifest) => {
      manifest.version = null;
    },
    [["dmsVersion", null]],
  ],
  [
    "an object version",
    (manifest) => {
      manifest.version = { major: 1 };
    },
    [["dmsVersion", { major: 1 }]],
  ],
];

for (const [name, edit, expected] of manifests) {
  await test(`docs-catalog: generates and checks with ${name}`, () => {
    const { generate, check, dmsVersion, shipped } = generateCatalog(edit);
    assert.equal(generate.status, 0);
    assert.deepEqual(dmsVersion, expected ?? shipped);
    assert.equal(check.status, 0);
  });
}

const block = '{ "type": "Heading", "options": {}, "children": [] }';
const withWidth = (/** @type {string} */ width) =>
  `{ "type": "Heading", "options": {}, "children": [], "width": ${width} }`;

await test("docs-screenshots: asks for the width an example names", () => {
  const { status, widths, shots } = captureExamples(
    `{ "a": ${withWidth("800")} }`,
    "a",
  );
  assert.equal(status, 0);
  assert.deepEqual(shots, ["a.light.png"]);
  assert.deepEqual(widths, [800]);
});

await test("docs-screenshots: a null width gets the width of an example without one", () => {
  const withoutWidth = captureExamples(`{ "a": ${block} }`, "a");
  const nullWidth = captureExamples(`{ "a": ${withWidth("null")} }`, "a");
  assert.equal(nullWidth.status, 0);
  assert.deepEqual(nullWidth.shots, ["a.light.png"]);
  assert.equal(nullWidth.widths.length, 1);
  assert.deepEqual(nullWidth.widths, withoutWidth.widths);
});

await test("docs-screenshots: captures an example named __proto__", () => {
  const { status, shots } = captureExamples(
    `{ "__proto__": ${block} }`,
    "__proto__",
  );
  assert.equal(status, 0);
  assert.deepEqual(shots, ["__proto__.light.png"]);
});

await test("docs-screenshots: captures the entries of a root array by index", () => {
  const { status, shots } = captureExamples(`[ ${block} ]`, "0");
  assert.equal(status, 0);
  assert.deepEqual(shots, ["0.light.png"]);
});

await test("docs-screenshots: leaves a numeric type to the preview page", () => {
  const { status, shots } = captureExamples(
    '{ "a": { "type": 5, "options": {}, "children": [] } }',
    "a",
  );
  assert.equal(status, 0);
  assert.deepEqual(shots, ["a.light.png"]);
});

await test("docs-screenshots: leaves an entry that is a string to the preview page", () => {
  const { status, shots } = captureExamples('{ "a": "heading" }', "a");
  assert.equal(status, 0);
  assert.deepEqual(shots, ["a.light.png"]);
});
