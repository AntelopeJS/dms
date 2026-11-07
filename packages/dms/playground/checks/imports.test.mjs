import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { test } from "node:test";
import {
  assertAccepted,
  assertRejected,
  fixturePath,
  root,
} from "./fixtures.mjs";

const scanner = nodePath.join(import.meta.dirname, "aliases.cjs");

/** @typedef {[path: string, source: string, failures?: number | null]} Fixture */

await test("checks resolved import targets regardless of expression spelling or Vue source form", (t) => {
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const hidden = nodePath.join(
    root,
    `../frontend-vue/layers/dms-core/app/node_modules/${id}`,
  );
  const dist = nodePath.join(root, `dist/${id}.js`);
  for (const path of [nodePath.join(hidden, "index.js"), dist]) {
    mkdirSync(nodePath.dirname(path), { recursive: true });
    writeFileSync(path, "module.exports = 1;\n");
  }
  t.after(() => {
    rmSync(hidden, { recursive: true });
    rmSync(dist);
  });

  /** @type {{ path: string, extension: string, wrap: (code: string) => string, client: boolean }[]} */
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
  /** @type {Fixture[]} */
  const mixed = [];
  /** @type {Fixture[]} */
  const forbidden = [];
  /** @type {Fixture[]} */
  const accepted = [];
  for (const context of contexts) {
    const ownDist = context.client ? `../../dist/${id}` : `../dist/${id}`;
    const backend = context.client ? "../../../src/index" : "../../src/index";
    mixed.push([
      fixturePath(context.path, context.extension),
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
      6,
    ]);
    const control = context.client
      ? 'require(("#dms-core/app/utils/http-status" satisfies string));'
      : 'require(("./sections" satisfies string));';
    accepted.push([
      fixturePath(context.path, context.extension),
      context.wrap(control + '\nimport "@antelopejs/interface-dms/page";'),
    ]);
    if (!context.client) {
      forbidden.push([
        fixturePath(context.path, context.extension),
        'require(("#dms-core/app/utils/http-status" satisfies string));',
      ]);
    }
  }
  assertRejected(["forbidden", "static"], mixed);
  assertRejected("forbidden", forbidden);
  assertRejected("extScript", [
    [
      fixturePath("frontend-vue/app", "vue"),
      '<script lang="ts" src="#dms-core/../../../src/index"></script>',
    ],
    [
      fixturePath("frontend-vue/app", "vue"),
      '<script lang="ts" src="#dms-core/app/utils/http-status"></script>',
    ],
  ]);
  assertAccepted(accepted);
});

await test("rejects client import.meta.glob access to backend and interface sources", () => {
  assertRejected(
    "forbidden",
    ["../../../src/**/*.ts", "../../../../interface-dms/src/**/*.ts"].map(
      (pattern) => [
        fixturePath("frontend-vue/app"),
        `import.meta.glob(${JSON.stringify(pattern)});`,
        null,
      ],
    ),
  );
  assertAccepted([
    [
      fixturePath("frontend-vue/app"),
      [
        'import "#dms-core/app/utils/http-status";',
        'import "@antelopejs/interface-dms/page";',
        'import "./composables/usePageSetupLog";',
        'import.meta.glob("./composables/*.ts");',
      ].join("\n"),
    ],
  ]);
});

await test("rejects client new URL access to backend source through import.meta.url", () => {
  assertRejected("loader", [
    [
      fixturePath("frontend-vue/app"),
      'new URL("../../../src/index.ts", import.meta.url);',
      null,
    ],
  ]);
});

await test("rejects wrapped client relative dynamic imports into shared Vue layers", () => {
  assertRejected("forbidden", [
    [
      fixturePath("frontend-vue/app"),
      'import(("../../../frontend-vue/layers/dms-core/app/utils/http-status" satisfies string));',
      null,
    ],
  ]);
});

await test("rejects server module.require and require.resolve access to own dist", (t) => {
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const dist = nodePath.join(root, "dist", `${id}.js`);
  mkdirSync(nodePath.dirname(dist), { recursive: true });
  writeFileSync(dist, "module.exports = 1;\n");
  t.after(() => rmSync(dist));
  assertRejected(
    "loader",
    [
      `module.require("../dist/${id}.js");`,
      `require.resolve("../dist/${id}.js");`,
      `const load = require; load("../dist/${id}.js");`,
      `const key = "require"; globalThis[key]("../dist/${id}.js");`,
      `import.meta.resolve("../dist/${id}.js");`,
      `const glob = import.meta.glob; glob("../dist/*.js");`,
    ].map((source) => [fixturePath("src"), source, null]),
  );
});

await test("rejects same-tier and upward chart imports through wrapped require", () => {
  const targets = ["../quick-actions", "../index"];
  assertRejected(
    "forbidden",
    targets.map((target) => [
      fixturePath("src/chart"),
      `require((${JSON.stringify(target)} satisfies string));`,
      null,
    ]),
  );
  assertRejected(
    "loader",
    targets.map((target) => [
      fixturePath("src/chart"),
      `(0, require)(${JSON.stringify(target)});`,
      null,
    ]),
  );
  assertAccepted([
    [fixturePath("src/chart"), 'require(("./category" satisfies string));'],
  ]);
});

await test("rejects server type imports from the client frontend-module package", () => {
  assertRejected("forbidden", [
    [
      fixturePath("src"),
      'import type * as FrontendModule from "@antelopejs/dms-frontend/templates/vue/frontend-module.ts";',
      null,
    ],
  ]);
});

await test("rejects backend loaders in Vue templates rather than scanning only scripts", () => {
  assertRejected(
    "forbidden",
    [
      `<template><button @click="() => import('../../../src/index.ts')">Load</button></template>`,
      `<template><div>{{ require('../../../src/index.ts') }}</div></template>`,
      `<template><div v-if="require('../../../src/index.ts')">Load</div></template>`,
      `<template><div :title="import('../../../src/index.ts')">Load</div></template>`,
      '<template src="../../../src/index.ts"></template>',
    ].map((source) => [fixturePath("frontend-vue/app", "vue"), source, null]),
  );
  assertAccepted(
    ["./composables/usePageSetupLog", "#dms-core/app/utils/http-status"].map(
      (target) => [
        fixturePath("frontend-vue/app", "vue"),
        `<template>
        <button @click="() => import('${target}')">Load</button>
        <div>{{ require('${target}') }}</div>
        <div v-if="require('${target}')" :title="import('${target}')">Load</div>
      </template>`,
      ],
    ),
  );
});

await test("rejects scanned file symlinks instead of canonicalizing chart imports into quick-actions", (t) => {
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const target = nodePath.join(root, "src/quick-actions", `${id}.ts`);
  const link = nodePath.join(root, "src/chart", `${id}.ts`);
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

await test("rejects external Vue scripts rather than accepting uninspected contents", (t) => {
  const vue = fixturePath("frontend-vue/app", "vue");
  const script = vue.replace(/\.vue$/, ".inc");
  t.after(() => rmSync(script, { force: true }));
  writeFileSync(script, 'import "../../../src/index.ts"; export default {};\n');
  assertRejected("extScript", [
    [
      vue,
      `<script lang="js" src="./${script.split("/").at(-1)}"></script><template><div>Probe</div></template>`,
      null,
    ],
  ]);
});

await test("rejects source edges into every directory skipped by the scanner", (t) => {
  const directory = fixturePath("frontend-vue/app").replace(/\.ts$/, "");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  assertRejected(
    "forbidden",
    [".nuxt", ".output", "dist", "node_modules"].map((skipped) => {
      const hidden = nodePath.join(directory, skipped, "hidden.ts");
      mkdirSync(nodePath.dirname(hidden), { recursive: true });
      writeFileSync(hidden, 'import "../../../../../src/index.ts";\n');
      return [
        fixturePath("frontend-vue/app"),
        `import "./${directory.split("/").at(-1)}/${skipped}/hidden.ts";`,
        null,
      ];
    }),
  );
  assertAccepted([
    [
      fixturePath("frontend-vue/app"),
      'import "./composables/usePageSetupLog";',
    ],
  ]);
});

await test("checks JSX loaders with the declared script kind and rejects parse recovery", () => {
  /** @type {Fixture[]} */
  const rejected = [];
  /** @type {Fixture[]} */
  const accepted = [];
  for (const extension of ["tsx", "jsx"]) {
    const specifiers = [
      '("../../../src/index.ts")',
      '"../../../src/" + "index.ts"',
    ];
    if (extension === "tsx")
      specifiers.push('("../../../src/index.ts" satisfies string)');
    for (const specifier of specifiers) {
      const source = `export const value = <div>{import(${specifier})}</div>;`;
      rejected.push(
        [fixturePath("frontend-vue/app", extension), source, null],
        [
          fixturePath("frontend-vue/app", "vue"),
          `<script lang="${extension}">${source}</script>`,
          null,
        ],
      );
    }
    const source =
      'export const value = <div>{import("./composables/usePageSetupLog")}</div>;';
    accepted.push(
      [fixturePath("frontend-vue/app", extension), source],
      [
        fixturePath("frontend-vue/app", "vue"),
        `<script lang="${extension}">${source}</script>`,
      ],
    );
  }
  assertRejected("forbidden", rejected);
  assertAccepted(accepted);
  assertRejected("parse", [
    [fixturePath("frontend-vue/app"), "export const incomplete = ;", null],
    [
      fixturePath("frontend-vue/app", "vue"),
      '<script lang="ts">export const incomplete = ;</script>',
      null,
    ],
  ]);
});

await test("rejects uninspected Vite inc targets even beside a TypeScript shadow", (t) => {
  const bridge = fixturePath("frontend-vue/app", "inc");
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
  assertRejected(
    "forbidden",
    [bridge, fragment, encoded].map((target) => [
      fixturePath("frontend-vue/app"),
      `export * from "./${target.split("/").at(-1)}";`,
    ]),
  );
});

await test("rejects uninspected Node inc targets that can execute backend code", (t) => {
  const bridge = fixturePath("src", "inc");
  t.after(() => rmSync(bridge, { force: true }));
  writeFileSync(
    bridge,
    'module.exports = require("../../src/utils/run-in-batches.ts");',
  );
  assertRejected("forbidden", [
    [fixturePath("src", "cjs"), `require("./${bridge.split("/").at(-1)}");`],
  ]);
});

await test("rejects extensionless executable targets rather than trusting their local path", (t) => {
  const bridge = fixturePath("src").replace(/\.ts$/, "");
  t.after(() => rmSync(bridge, { force: true }));
  writeFileSync(
    bridge,
    'module.exports = require("../../src/utils/run-in-batches.ts");',
  );
  assertRejected("forbidden", [
    [fixturePath("src", "cjs"), `require("./${bridge.split("/").at(-1)}");`],
  ]);
});

await test("permits inert target kinds without treating Node require as a Vite asset loader", (t) => {
  const prefix = fixturePath("frontend-vue/app").replace(/\.ts$/, "");
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
  assertAccepted(
    [
      `import "./${name}.json"; import "./${name}.inc?raw"; import "./${name}.inc?url"; require("./${name}.json");`,
      `import.meta.glob("./${name}.inc", { query: "?raw" });`,
    ].map((source) => [fixturePath("frontend-vue/app"), source]),
  );
  assertRejected(
    "forbidden",
    [
      `import "./${name}.inc?raw&unmodeled";`,
      'import "../../../src/utils/run-in-batches.ts?raw";',
      ...[".css", ".inc?raw", ".inc?url"].map(
        (suffix) => `require("./${name}${suffix}");`,
      ),
      `import asset = require("./${name}.css");`,
    ].map((source) => [fixturePath("frontend-vue/app"), source]),
  );
});

await test("rejects scanned directory symlinks instead of silently skipping own-dist imports", (t) => {
  const id = `__import_guard_${randomUUID().replaceAll("-", "")}`;
  const target = nodePath.join(root, id);
  const link = nodePath.join(root, "src", id);
  const dist = nodePath.join(root, "dist", `${id}.js`);
  t.after(() => {
    rmSync(link, { force: true });
    rmSync(target, { recursive: true, force: true });
    rmSync(dist, { force: true });
  });
  mkdirSync(target);
  mkdirSync(nodePath.dirname(dist), { recursive: true });
  writeFileSync(dist, "module.exports = 1;\n");
  writeFileSync(
    nodePath.join(target, "index.ts"),
    `require("../dist/${id}.js");\n`,
  );
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
  await test(`rejects package metadata resolution through ${name}`, (t) => {
    const directory = fixturePath("src").replace(/\.ts$/, "");
    mkdirSync(directory);
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    writeFileSync(nodePath.join(directory, "safe.ts"), "export {};\n");
    writeFileSync(
      nodePath.join(directory, "bridge.inc"),
      'module.exports = require("../../../src/index.ts");',
    );
    writeFileSync(
      nodePath.join(directory, "probe.cjs"),
      `require(${JSON.stringify(request)});`,
    );
    assertRejected("metadata", [
      [nodePath.join(directory, "package.json"), JSON.stringify(metadata)],
    ]);
  });
}

await test("rejects hidden/nested package.json across walked roots", (t) => {
  assertRejected(
    "metadata",
    ["src", "frontend-vue", "frontend-vue/app"].map((area) => {
      const directory = fixturePath(area).replace(/\.ts$/, "");
      const nested = nodePath.join(directory, ".hidden", "nested");
      mkdirSync(nested, { recursive: true });
      t.after(() => rmSync(directory, { recursive: true, force: true }));
      return [nodePath.join(nested, "package.json"), "{}"];
    }),
  );
});

await import("./manifest.test.mjs");
await import("./styles.test.mjs");
await import("./fixtures.test.mjs");
