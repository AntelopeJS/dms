import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureExamples,
  checkPages,
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

await test("docs-catalog: passes when every block type has one page with both directives", () => {
  const { generate, check } = checkPages(() => {});
  assert.equal(generate.status, 0);
  assert.equal(check.status, 0, check.stderr);
});

await test("docs-catalog: fails on a block type no page documents", () => {
  const { check } = checkPages((pages) => {
    pages.delete("docs/Banner.md");
  });
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /Banner: no page/);
});

await test("docs-catalog: fails on a block type two pages document", () => {
  const { check } = checkPages((pages) => {
    pages.set("docs/more/Banner.md", pages.get("docs/Banner.md") ?? "");
  });
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /Banner: 2 pages/);
  assert.match(check.stderr, /docs\/Banner\.md/);
  assert.match(check.stderr, /docs\/more\/Banner\.md/);
});

await test("docs-catalog: a page with only one of the two directives does not document the type", () => {
  const { check } = checkPages((pages) => {
    pages.set("docs/Banner.md", '::block-playground{type="Banner"}\n');
  });
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /Banner: no page/);
});

await test("docs-catalog: a playground that names its block type with example= counts", () => {
  const { check } = checkPages((pages) => {
    pages.set(
      "docs/Spacer.md",
      '::block-playground{example="Spacer" height="120"}\n\n::block-options{type="Spacer"}\n',
    );
  });
  assert.equal(check.status, 0, check.stderr);
});

await test("docs-catalog: a directive inside a code fence documents nothing", () => {
  const { check } = checkPages((pages) => {
    pages.set(
      "docs/Banner.md",
      '```md\n::block-playground{type="Banner"}\n\n::block-options{type="Banner"}\n```\n',
    );
  });
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /Banner: no page/);
});

await test("docs-catalog: a playground and a table on different pages document nothing", () => {
  const { check } = checkPages((pages) => {
    pages.set("docs/Banner.md", '::block-playground{type="Banner"}\n');
    pages.set("docs/BannerOptions.md", '::block-options{type="Banner"}\n');
  });
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /Banner: no page/);
});

const block = '{ "type": "Heading", "options": {}, "children": [] }';
const withWidth = (/** @type {string} */ width) =>
  `{ "type": "Heading", "options": {}, "children": [], "width": ${width} }`;

await test("docs-screenshots: asks for the width an example names", () => {
  const { status, widths, shots } = captureExamples(
    `{ "a": ${withWidth("800")} }`,
    "a",
  );
  assert.equal(status, 0);
  assert.deepEqual(shots, ["a.dark.png"]);
  assert.deepEqual(widths, [800]);
});

await test("docs-screenshots: renders dark only and refuses a light theme", () => {
  const dark = captureExamples(`{ "a": ${block} }`, "a");
  assert.equal(dark.status, 0);
  assert.deepEqual(dark.shots, ["a.dark.png"]);
  const light = captureExamples(`{ "a": ${block} }`, "a", ["--theme", "light"]);
  assert.notEqual(light.status, 0);
  assert.deepEqual(light.shots, []);
});

await test("docs-screenshots: a null width gets the width of an example without one", () => {
  const withoutWidth = captureExamples(`{ "a": ${block} }`, "a");
  const nullWidth = captureExamples(`{ "a": ${withWidth("null")} }`, "a");
  assert.equal(nullWidth.status, 0);
  assert.deepEqual(nullWidth.shots, ["a.dark.png"]);
  assert.equal(nullWidth.widths.length, 1);
  assert.deepEqual(nullWidth.widths, withoutWidth.widths);
});

await test("docs-screenshots: captures an example named __proto__", () => {
  const { status, shots } = captureExamples(
    `{ "__proto__": ${block} }`,
    "__proto__",
  );
  assert.equal(status, 0);
  assert.deepEqual(shots, ["__proto__.dark.png"]);
});

await test("docs-screenshots: captures the entries of a root array by index", () => {
  const { status, shots } = captureExamples(`[ ${block} ]`, "0");
  assert.equal(status, 0);
  assert.deepEqual(shots, ["0.dark.png"]);
});

await test("docs-screenshots: leaves a numeric type to the preview page", () => {
  const { status, shots } = captureExamples(
    '{ "a": { "type": 5, "options": {}, "children": [] } }',
    "a",
  );
  assert.equal(status, 0);
  assert.deepEqual(shots, ["a.dark.png"]);
});

await test("docs-screenshots: leaves an entry that is a string to the preview page", () => {
  const { status, shots } = captureExamples('{ "a": "heading" }', "a");
  assert.equal(status, 0);
  assert.deepEqual(shots, ["a.dark.png"]);
});
