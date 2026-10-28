const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { mkdirSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const { dirname, join, resolve } = require("node:path");
const { test } = require("node:test");

const root = resolve(__dirname, "..");
const scanner = join(__dirname, "aliases.cjs");

function checkFixture(
  path,
  source,
  accepted,
  expectedFailures = accepted ? 0 : 1,
) {
  writeFileSync(path, source);
  let result;
  try {
    result = spawnSync(process.execPath, [scanner], { encoding: "utf8" });
  } finally {
    rmSync(path);
  }
  assert.equal(result.status, accepted ? 0 : 1, result.stdout + result.stderr);
  const diagnostics = result.stderr
    .split("\n")
    .filter((line) => line.startsWith(`${path}:`));
  if (expectedFailures === null) {
    assert.ok(diagnostics.length > 0, result.stderr);
  } else {
    assert.equal(diagnostics.length, expectedFailures, result.stderr);
  }
  return result;
}

test("checks resolved import targets regardless of expression spelling or Vue source form", (t) => {
  const baseline = spawnSync(process.execPath, [scanner], { encoding: "utf8" });
  assert.equal(baseline.status, 0, baseline.stderr);
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const hidden = join(
    root,
    `../frontend-vue/layers/dms-core/app/node_modules/${id}`,
  );
  const dist = join(root, `dist/${id}.js`);
  for (const path of [join(hidden, "index.js"), dist]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "module.exports = 1;\n");
  }
  t.after(() => {
    rmSync(hidden, { recursive: true });
    rmSync(dist);
  });

  const contexts = [
    { path: "src", extension: "ts", wrap: (code) => code, client: false },
    {
      path: "frontend-vue/app",
      extension: "ts",
      wrap: (code) => code,
      client: true,
    },
    {
      path: "frontend-vue/app",
      extension: "vue",
      wrap: (code) => `<script setup lang="ts">${code}</script>`,
      client: true,
    },
    {
      path: "frontend-vue/app",
      extension: "vue",
      wrap: (code) => `<script lang="ts">${code}</script>`,
      client: true,
    },
  ];
  for (const context of contexts) {
    const path = join(root, context.path, `${id}.${context.extension}`);
    const ownDist = context.client ? `../../dist/${id}` : `../dist/${id}`;
    const backend = context.client ? "../../../src/index" : "../../src/index";
    checkFixture(
      path,
      context.wrap(
        [
          `require((${JSON.stringify(ownDist)} satisfies string));`,
          `import((${JSON.stringify(backend)} as string));`,
          `import "#dms-core/app/node_modules/${id}/index";`,
          'require(`#dms-core/${"../../../src"}/index`);',
          'require("#dms-core/" + "../../../src/index");',
          "import(unknownSpecifier);",
        ].join("\n"),
      ),
      false,
      6,
    );
    const control = context.client
      ? 'require(("#dms-core/app/utils/http-status" satisfies string));'
      : 'require(("./sections" satisfies string));';
    checkFixture(
      path,
      context.wrap(control + '\nimport "@antelopejs/interface-dms/page";'),
      true,
    );
    if (!context.client) {
      checkFixture(
        path,
        'require(("#dms-core/app/utils/http-status" satisfies string));',
        false,
      );
    }
  }
  const vue = join(root, "frontend-vue/app", `${id}.vue`);
  checkFixture(
    vue,
    '<script lang="ts" src="#dms-core/../../../src/index"></script>',
    false,
  );
  checkFixture(
    vue,
    '<script lang="ts" src="#dms-core/app/utils/http-status"></script>',
    false,
  );
});

function fixturePath(area) {
  return join(
    root,
    area,
    `__import_guard_${randomUUID().replaceAll("-", "")}.ts`,
  );
}

test("rejects client import.meta.glob access to backend and interface sources", () => {
  const path = fixturePath("frontend-vue/app");
  for (const pattern of [
    "../../../src/**/*.ts",
    "../../../../interface-dms/src/**/*.ts",
  ]) {
    const result = checkFixture(
      path,
      `import.meta.glob(${JSON.stringify(pattern)});`,
      false,
      null,
    );
    assert.equal(result.status, 1);
  }
  checkFixture(
    path,
    [
      'import "#dms-core/app/utils/http-status";',
      'import "@antelopejs/interface-dms/page";',
      'import "./composables/usePageSetupLog";',
      'import.meta.glob("./composables/*.ts");',
    ].join("\n"),
    true,
  );
});

test("rejects client new URL access to backend source through import.meta.url", () => {
  const result = checkFixture(
    fixturePath("frontend-vue/app"),
    'new URL("../../../src/index.ts", import.meta.url);',
    false,
    null,
  );
  assert.equal(result.status, 1);
});

test("rejects wrapped client relative dynamic imports into shared Vue layers", () => {
  const result = checkFixture(
    fixturePath("frontend-vue/app"),
    'import(("../../../frontend-vue/layers/dms-core/app/utils/http-status" satisfies string));',
    false,
    null,
  );
  assert.equal(result.status, 1);
});

test("rejects server module.require and require.resolve access to own dist", (t) => {
  const path = fixturePath("src");
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const dist = join(root, "dist", `${id}.js`);
  mkdirSync(dirname(dist), { recursive: true });
  writeFileSync(dist, "module.exports = 1;\n");
  t.after(() => rmSync(dist));
  for (const loader of ["module.require", "require.resolve"]) {
    const result = checkFixture(
      path,
      `${loader}("../dist/${id}.js");`,
      false,
      null,
    );
    assert.equal(result.status, 1);
  }
  for (const source of [
    `const load = require; load("../dist/${id}.js");`,
    `const key = "require"; globalThis[key]("../dist/${id}.js");`,
    `import.meta.resolve("../dist/${id}.js");`,
    `const glob = import.meta.glob; glob("../dist/*.js");`,
  ]) {
    checkFixture(path, source, false, null);
  }
});

test("rejects same-tier and upward chart imports through wrapped require", () => {
  const path = fixturePath("src/chart");
  for (const target of ["../quick-actions", "../index"]) {
    const result = checkFixture(
      path,
      `require((${JSON.stringify(target)} satisfies string));`,
      false,
      null,
    );
    assert.equal(result.status, 1);
    checkFixture(path, `(0, require)(${JSON.stringify(target)});`, false, null);
  }
  checkFixture(path, 'require(("./category" satisfies string));', true);
});

test("rejects server type imports from the client frontend-module package", () => {
  const result = checkFixture(
    fixturePath("src"),
    'import type * as FrontendModule from "@antelopejs/dms-frontend/templates/vue/frontend-module.ts";',
    false,
    null,
  );
  assert.equal(result.status, 1);
});

test("rejects backend loaders in Vue templates rather than scanning only scripts", () => {
  const path = fixturePath("frontend-vue/app").replace(/\.ts$/, ".vue");
  for (const source of [
    `<template><button @click="() => import('../../../src/index.ts')">Load</button></template>`,
    `<template><div>{{ require('../../../src/index.ts') }}</div></template>`,
    `<template><div v-if="require('../../../src/index.ts')">Load</div></template>`,
    `<template><div :title="import('../../../src/index.ts')">Load</div></template>`,
    '<template src="../../../src/index.ts"></template>',
  ]) {
    const result = checkFixture(path, source, false, null);
    assert.equal(result.status, 1);
  }
  for (const target of [
    "./composables/usePageSetupLog",
    "#dms-core/app/utils/http-status",
  ]) {
    checkFixture(
      path,
      `<template>
        <button @click="() => import('${target}')">Load</button>
        <div>{{ require('${target}') }}</div>
        <div v-if="require('${target}')" :title="import('${target}')">Load</div>
      </template>`,
      true,
    );
  }
});

test("rejects scanned file symlinks instead of canonicalizing chart imports into quick-actions", (t) => {
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const target = join(root, "src/quick-actions", `${id}.ts`);
  const link = join(root, "src/chart", `${id}.ts`);
  t.after(() => {
    rmSync(link, { force: true });
    rmSync(target, { force: true });
  });
  writeFileSync(target, 'require("./page");\n');
  symlinkSync(target, link, "file");
  const result = spawnSync(process.execPath, [scanner], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(
    result.stderr.split("\n").some((line) => line.startsWith(`${link}:`)),
    result.stderr,
  );
});

test("rejects external Vue scripts rather than accepting uninspected contents", (t) => {
  const vue = fixturePath("frontend-vue/app").replace(/\.ts$/, ".vue");
  const script = vue.replace(/\.vue$/, ".inc");
  t.after(() => rmSync(script, { force: true }));
  writeFileSync(script, 'import "../../../src/index.ts"; export default {};\n');
  const result = checkFixture(
    vue,
    `<script lang="js" src="./${script.split("/").at(-1)}"></script><template><div>Probe</div></template>`,
    false,
    null,
  );
  assert.equal(result.status, 1);
});

test("rejects source edges into every directory skipped by the scanner", (t) => {
  const path = fixturePath("frontend-vue/app");
  const directory = path.replace(/\.ts$/, "");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const skipped of [".nuxt", ".output", "dist", "node_modules"]) {
    const hidden = join(directory, skipped, "hidden.ts");
    mkdirSync(dirname(hidden), { recursive: true });
    writeFileSync(hidden, 'import "../../../../../src/index.ts";\n');
    const result = checkFixture(
      path,
      `import "./${directory.split("/").at(-1)}/${skipped}/hidden.ts";`,
      false,
      null,
    );
    assert.equal(result.status, 1);
  }
  checkFixture(path, 'import "./composables/usePageSetupLog";', true);
});

test("checks JSX loaders with the declared script kind and rejects parse recovery", () => {
  for (const extension of ["tsx", "jsx"]) {
    const path = fixturePath("frontend-vue/app").replace(
      /\.ts$/,
      `.${extension}`,
    );
    const specifiers = [
      '("../../../src/index.ts")',
      '"../../../src/" + "index.ts"',
    ];
    if (extension === "tsx")
      specifiers.push('("../../../src/index.ts" satisfies string)');
    for (const specifier of specifiers) {
      const source = `export const value = <div>{import(${specifier})}</div>;`;
      const result = checkFixture(path, source, false, null);
      assert.equal(result.status, 1);
      checkFixture(
        path.replace(/\.[jt]sx$/, ".vue"),
        `<script lang="${extension}">${source}</script>`,
        false,
        null,
      );
    }
    checkFixture(
      path,
      'export const value = <div>{import("./composables/usePageSetupLog")}</div>;',
      true,
    );
    checkFixture(
      path.replace(/\.[jt]sx$/, ".vue"),
      `<script lang="${extension}">export const value = <div>{import("./composables/usePageSetupLog")}</div>;</script>`,
      true,
    );
  }
  const path = fixturePath("frontend-vue/app");
  checkFixture(path, "export const incomplete = ;", false, null);
  checkFixture(
    path.replace(/\.ts$/, ".vue"),
    '<script lang="ts">export const incomplete = ;</script>',
    false,
    null,
  );
});

test("rejects uninspected Vite inc targets even beside a TypeScript shadow", (t) => {
  const path = fixturePath("frontend-vue/app");
  const bridge = path.replace(/\.ts$/, ".inc");
  const shadow = `${bridge}.ts`;
  const fragment = `${bridge}#shadow.ts`;
  const encoded = `${bridge}%23shadow.ts`;
  t.after(() => {
    rmSync(bridge, { force: true });
    rmSync(shadow, { force: true });
    rmSync(fragment, { force: true });
    rmSync(encoded, { force: true });
  });
  writeFileSync(
    bridge,
    'export { runInBatches } from "../../../src/utils/run-in-batches.ts";',
  );
  writeFileSync(shadow, "export {};\n");
  writeFileSync(fragment, "export {};\n");
  writeFileSync(encoded, "export {};\n");
  const result = checkFixture(
    path,
    `export * from "./${bridge.split("/").at(-1)}";`,
    false,
  );
  assert.equal(result.status, 1);
  for (const target of [fragment, encoded])
    checkFixture(path, `export * from "./${target.split("/").at(-1)}";`, false);
});

test("rejects uninspected Node inc targets that can execute backend code", (t) => {
  const path = fixturePath("src").replace(/\.ts$/, ".cjs");
  const bridge = path.replace(/\.cjs$/, ".inc");
  t.after(() => rmSync(bridge, { force: true }));
  writeFileSync(
    bridge,
    'module.exports = require("../../src/utils/run-in-batches.ts");',
  );
  const result = checkFixture(
    path,
    `require("./${bridge.split("/").at(-1)}");`,
    false,
  );
  assert.equal(result.status, 1);
});

test("rejects extensionless executable targets rather than trusting their local path", (t) => {
  const path = fixturePath("src").replace(/\.ts$/, ".cjs");
  const bridge = path.replace(/\.cjs$/, "");
  t.after(() => rmSync(bridge, { force: true }));
  writeFileSync(
    bridge,
    'module.exports = require("../../src/utils/run-in-batches.ts");',
  );
  const result = checkFixture(
    path,
    `require("./${bridge.split("/").at(-1)}");`,
    false,
  );
  assert.equal(result.status, 1);
});

test("permits inert target kinds without treating Node require as a Vite asset loader", (t) => {
  const path = fixturePath("frontend-vue/app");
  const prefix = path.replace(/\.ts$/, "");
  const sources = new Map([
    [".json", '{"ok":true}'],
    [".inc", 'require("../../../src/utils/run-in-batches.ts");'],
  ]);
  t.after(() => {
    for (const suffix of sources.keys())
      rmSync(prefix + suffix, { force: true });
  });
  for (const [suffix, source] of sources)
    writeFileSync(prefix + suffix, source);
  const name = prefix.split("/").at(-1);
  const result = checkFixture(
    path,
    `import "./${name}.json"; import "./${name}.inc?raw"; import "./${name}.inc?url"; require("./${name}.json");`,
    true,
  );
  assert.equal(result.status, 0);
  checkFixture(
    path,
    `import.meta.glob("./${name}.inc", { query: "?raw" });`,
    true,
  );
  for (const specifier of [
    `./${name}.inc?raw&unmodeled`,
    "../../../src/utils/run-in-batches.ts?raw",
  ])
    checkFixture(path, `import "${specifier}";`, false);
  for (const suffix of [".css", ".inc?raw", ".inc?url"])
    checkFixture(path, `require("./${name}${suffix}");`, false);
  checkFixture(path, `import asset = require("./${name}.css");`, false);
});

test("rejects scanned directory symlinks instead of silently skipping own-dist imports", (t) => {
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const target = join(root, id);
  const link = join(root, "src", id);
  const dist = join(root, "dist", `${id}.js`);
  t.after(() => {
    rmSync(link, { force: true });
    rmSync(target, { recursive: true, force: true });
    rmSync(dist, { force: true });
  });
  mkdirSync(target);
  mkdirSync(dirname(dist), { recursive: true });
  writeFileSync(dist, "module.exports = 1;\n");
  writeFileSync(join(target, "index.ts"), `require("../dist/${id}.js");\n`);
  symlinkSync(target, link, "dir");
  const result = spawnSync(process.execPath, [scanner], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(
    result.stderr.split("\n").some((line) => line.startsWith(`${link}:`)),
    result.stderr,
  );
});

for (const { name, metadata, request } of [
  {
    name: "nested imports/types/default",
    metadata: {
      imports: { "#bridge": { types: "./safe.ts", default: "./bridge.inc" } },
    },
    request: "#bridge",
  },
  {
    name: "self exports",
    metadata: {
      name: "guard-self",
      exports: { ".": { types: "./safe.ts", default: "./bridge.inc" } },
    },
    request: "guard-self",
  },
  {
    name: "directory main/types",
    metadata: { main: "./bridge.inc", types: "./safe.ts" },
    request: ".",
  },
]) {
  test(`rejects package metadata resolution through ${name}`, (t) => {
    const directory = fixturePath("src").replace(/\.ts$/, "");
    mkdirSync(directory);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    writeFileSync(join(directory, "safe.ts"), "export {};\n");
    writeFileSync(
      join(directory, "bridge.inc"),
      'module.exports = require("../../../src/index.ts");',
    );
    writeFileSync(
      join(directory, "probe.cjs"),
      `require(${JSON.stringify(request)});`,
    );
    assert.equal(
      checkFixture(
        join(directory, "package.json"),
        JSON.stringify(metadata),
        false,
      ).status,
      1,
    );
  });
}

test("rejects hidden/nested package.json across walked roots", (t) => {
  for (const area of ["src", "frontend-vue", "frontend-vue/app"]) {
    const directory = fixturePath(area).replace(/\.ts$/, "");
    const nested = join(directory, ".hidden", "nested");
    mkdirSync(nested, { recursive: true });
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    assert.equal(
      checkFixture(join(nested, "package.json"), "{}", false).status,
      1,
    );
  }
});

test("rejects inline and external Vue custom blocks", () => {
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

test("rejects CSS module imports and CSS @import files", (t) => {
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

test("rejects Vue style-src including safe targets", () => {
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

test("rejects inline CSS @import/url, escapes, and unknown syntax", () => {
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

test("preserves safe existing inline styles", () => {
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

require("./manifest.test.cjs");
