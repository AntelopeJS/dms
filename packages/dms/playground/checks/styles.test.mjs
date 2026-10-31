import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { checkFixture, fixturePath } from "./fixtures.mjs";

await test("rejects inline and external Vue custom blocks", () => {
  const path = fixturePath("frontend-vue/app").replace(/\.ts$/, ".vue");
  for (const block of [
    '<i18n>{"message":"hello"}</i18n>',
    '<docs src="../../../src/index.ts"></docs>',
  ])
    assert.equal(
      checkFixture(path, `<template><div>Probe</div></template>${block}`, false)
        .status,
      1,
    );
});

await test("rejects CSS module imports and CSS @import files", (t) => {
  const path = fixturePath("frontend-vue/app");
  const style = path.replace(/\.ts$/, ".css");
  t.after(() => rmSync(style, { force: true }));
  writeFileSync(style, '@import "../../../src/index.ts";');
  for (const suffix of ["", "?raw", "?url"])
    assert.equal(
      checkFixture(
        path,
        `import "./${style.split("/").at(-1)}${suffix}";`,
        false,
        null,
      ).status,
      1,
    );
});

await test("rejects Vue style-src including safe targets", () => {
  const path = fixturePath("frontend-vue/app").replace(/\.ts$/, ".vue");
  for (const source of [
    "./composables/usePageSetupLog.ts",
    "../../../src/index.ts",
  ])
    assert.equal(
      checkFixture(
        path,
        `<template><div /></template><style src="${source}"></style>`,
        false,
      ).status,
      1,
    );
});

await test("rejects inline CSS @import/url, escapes, and unknown syntax", () => {
  const path = fixturePath("frontend-vue/app").replace(/\.ts$/, ".vue");
  for (const source of [
    '@import "../../../src/index.ts";',
    '.probe { background: url("../../../src/index.ts"); }',
    String.raw`@\69mport "../../../src/index.ts";`,
    String.raw`.probe { background: u\72l("../../../src/index.ts"); }`,
    '.probe { --asset: url("../../../src/index.ts"); }',
    '.probe { background: image-set("../../../src/index.ts" 1x); }',
    '.probe { background: var(--asset, url("../../../src/index.ts")); }',
    ".probe { color: ; broken }",
  ])
    assert.equal(
      checkFixture(
        path,
        `<template><div /></template><style scoped>${source}</style>`,
        false,
      ).status,
      1,
    );
});

await test("preserves safe existing inline styles", () => {
  const path = fixturePath("frontend-vue/app").replace(/\.ts$/, ".vue");
  assert.equal(
    checkFixture(
      path,
      `<template><div /></template><style scoped>
    .x { --eco-strong: var(--eco-light); }
    .dark .x:hover {
      border: 1px solid var(--ui-border);
      color: color-mix(in srgb, var(--eco-dark) 14%, #fff);
      background: radial-gradient(red, transparent 65%), linear-gradient(100deg, red, transparent 70%);
    }
  </style>`,
      true,
    ).status,
    0,
  );
});
