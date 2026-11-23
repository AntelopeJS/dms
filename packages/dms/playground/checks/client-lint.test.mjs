import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const LAYER = fileURLToPath(new URL("../frontend-vue/", import.meta.url));

/** The client lint as `lint:client` runs it, from the layer, with its own config. */
const eslint = new ESLint({
  cwd: LAYER,
  overrideConfigFile: "../checks/client-lint.config.mjs",
});

/**
 * The restricted-syntax messages `lint:client` reports for a probe file.
 * @param {string} file
 * @param {string} source
 * @returns {Promise<string[]>}
 */
async function findings(file, source) {
  const results = await eslint.lintText(source, {
    filePath: `${LAYER}${file}`,
  });
  return results.flatMap((result) =>
    result.messages
      .filter(
        (message) =>
          message.ruleId === "no-restricted-syntax" ||
          message.ruleId === "vue/no-restricted-syntax",
      )
      .map((message) => message.message),
  );
}

/** Each form with the probes that reach server code and one that stays on the client. */
const PROBES = [
  {
    form: "a template asset attribute",
    file: "app/components/Probe.vue",
    server: [
      `<template><img src="../../../src/logo.png"></template>`,
      `<template><a href="../../../dist/index.js">x</a></template>`,
      `<template><img srcset="/@fs/repo/packages/dms/playground/src/logo.png 2x"></template>`,
    ],
    client: `<template><img src="../../assets/logo.png"></template>`,
  },
  {
    form: "a block src attribute",
    file: "app/components/Probe.vue",
    server: [
      `<script setup lang="ts" src="../../../src/sections.ts"></script>`,
    ],
    client: `<script setup lang="ts" src="./probe.ts"></script>`,
  },
  {
    form: "a style block path",
    file: "app/components/Probe.vue",
    server: [
      `<template><p /></template>\n<style scoped>\n@import "../../../src/theme.css";\n</style>`,
      `<template><p /></template>\n<style scoped>\np { background: url(../../../dist/logo.png); }\n</style>`,
      `<template><p /></template>\n<style lang="scss">\n@use "../../../src/theme";\n</style>`,
    ],
    client: `<template><p /></template>\n<style scoped>\n@import "../../assets/theme.css";\n</style>`,
  },
  {
    form: "import.meta.glob",
    file: "app/composables/probe.ts",
    server: [
      `export const sources = import.meta.glob(["../../../src/**/*.ts"], { query: "?raw" });`,
      "export const sources = import.meta.glob(`../../../${'src'}/*.ts`);",
    ],
    client: `export const sources = import.meta.glob(["../components/*.vue"], { query: "?raw" });`,
  },
  {
    form: "new URL(…, import.meta.url)",
    file: "app/components/Probe.vue",
    server: [
      `<script setup lang="ts">\nconst file = new URL("../../../src/index.ts", import.meta.url);\n</script>`,
      "<script setup lang=\"ts\">\nconst file = new URL(`../../../dist/${'index'}.js`, import.meta.url);\n</script>",
      "<script setup lang=\"ts\">\nconst dir = 'src';\nconst file = new URL(`../../../${dir}/logo.png`, import.meta.url);\n</script>",
    ],
    client: `<script setup lang="ts">\nconst file = new URL("../../assets/logo.png", import.meta.url);\n</script>`,
  },
  {
    form: "an interpolated dynamic import",
    file: "app/components/Probe.tsx",
    server: [
      "export const load = (name: string) => import(`../../../src/${name}.ts`);",
      "export const load = (dir: string) => import(`../../../${dir}/index.ts`);",
    ],
    client:
      "export const load = (name: string) => import(`../custom/${name}.vue`);",
  },
];

for (const { form, file, server, client } of PROBES) {
  await test(`${form} into server code is rejected`, async () => {
    for (const source of server) {
      const [message, ...rest] = await findings(file, source);
      assert.equal(rest.length, 0, source);
      assert.ok(message?.includes(`server through ${form}.`), source);
    }
  });

  await test(`${form} inside the client layer passes`, async () => {
    assert.deepEqual(await findings(file, client), []);
  });
}
