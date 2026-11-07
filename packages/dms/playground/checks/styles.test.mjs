import { rmSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { assertAccepted, assertRejected, fixturePath } from "./fixtures.mjs";

await test("rejects inline and external Vue custom blocks", () => {
  assertRejected(
    [
      '<i18n>{"message":"hello"}</i18n>',
      '<docs src="../../../src/index.ts"></docs>',
    ].map((block) => [
      fixturePath("frontend-vue/app", "vue"),
      `<template><div>Probe</div></template>${block}`,
    ]),
  );
});

await test("rejects CSS module imports and CSS @import files", (t) => {
  const style = fixturePath("frontend-vue/app", "css");
  t.after(() => rmSync(style, { force: true }));
  writeFileSync(style, '@import "../../../src/index.ts";');
  assertRejected(
    ["", "?raw", "?url"].map((suffix) => [
      fixturePath("frontend-vue/app"),
      `import "./${style.split("/").at(-1)}${suffix}";`,
      null,
    ]),
  );
});

await test("rejects Vue style-src including safe targets", () => {
  assertRejected(
    ["./composables/usePageSetupLog.ts", "../../../src/index.ts"].map(
      (source) => [
        fixturePath("frontend-vue/app", "vue"),
        `<template><div /></template><style src="${source}"></style>`,
      ],
    ),
  );
});

await test("rejects inline CSS @import/url, escapes, and unknown syntax", () => {
  assertRejected(
    [
      '@import "../../../src/index.ts";',
      '.probe { background: url("../../../src/index.ts"); }',
      String.raw`@\69mport "../../../src/index.ts";`,
      String.raw`.probe { background: u\72l("../../../src/index.ts"); }`,
      '.probe { --asset: url("../../../src/index.ts"); }',
      '.probe { background: image-set("../../../src/index.ts" 1x); }',
      '.probe { background: var(--asset, url("../../../src/index.ts")); }',
      ".probe { color: ; broken }",
    ].map((source) => [
      fixturePath("frontend-vue/app", "vue"),
      `<template><div /></template><style scoped>${source}</style>`,
    ]),
  );
});

await test("preserves safe existing inline styles", () => {
  assertAccepted([
    [
      fixturePath("frontend-vue/app", "vue"),
      `<template><div /></template><style scoped>
    .x { --eco-strong: var(--eco-light); }
    .dark .x:hover {
      border: 1px solid var(--ui-border);
      color: color-mix(in srgb, var(--eco-dark) 14%, #fff);
      background: radial-gradient(red, transparent 65%), linear-gradient(100deg, red, transparent 70%);
    }
  </style>`,
    ],
  ]);
});
