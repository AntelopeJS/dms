import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const LAYER = fileURLToPath(new URL("../frontend-vue/", import.meta.url));
const ESLINT = fileURLToPath(
  new URL(
    "../../frontend-vue/node_modules/eslint/bin/eslint.js",
    import.meta.url,
  ),
);

/**
 * The restricted-syntax messages `lint:client` reports for a probe file.
 * @param {string} file
 * @param {string} source
 * @returns {string[]}
 */
function findings(file, source) {
  const { status, stdout, stderr } = spawnSync(
    process.execPath,
    [
      ESLINT,
      "--config",
      "../checks/client-lint.config.mjs",
      "--format",
      "unix",
      "--stdin",
      "--stdin-filename",
      file,
    ],
    {
      cwd: LAYER,
      input: source,
      encoding: "utf8",
      env: { ...process.env, ESLINT_USE_FLAT_CONFIG: "true" },
    },
  );
  assert.equal(stderr, "");
  const messages = stdout.split("\n").flatMap((line) => {
    const finding =
      /^.+?:\d+:\d+: (.+) \[Error\/(?:vue\/)?no-restricted-syntax\]$/u.exec(
        line,
      );
    return finding?.[1] === undefined ? [] : [finding[1]];
  });
  assert.equal(status, messages.length === 0 ? 0 : 1, stdout);
  return messages;
}

/** Each form that reaches server code, with the same form kept on the client. */
const PROBES = [
  {
    form: "a template asset attribute",
    file: "app/components/Probe.vue",
    server: `<template><img src="../../../src/logo.png"></template>`,
    client: `<template><img src="../../assets/logo.png"></template>`,
  },
  {
    form: "a block src attribute",
    file: "app/components/Probe.vue",
    server: `<script setup lang="ts" src="../../../src/sections.ts"></script>`,
    client: `<script setup lang="ts" src="./probe.ts"></script>`,
  },
  {
    form: "a style @import or url()",
    file: "app/components/Probe.vue",
    server: `<template><p /></template>\n<style scoped>\n@import "../../../src/theme.css";\n</style>`,
    client: `<template><p /></template>\n<style scoped>\n@import "../../assets/theme.css";\n</style>`,
  },
  {
    form: "import.meta.glob",
    file: "app/composables/probe.ts",
    server: `export const sources = import.meta.glob(["../../../src/**/*.ts"], { query: "?raw" });`,
    client: `export const sources = import.meta.glob(["../components/*.vue"], { query: "?raw" });`,
  },
  {
    form: "new URL(…, import.meta.url)",
    file: "app/components/Probe.vue",
    server:
      "<script setup lang=\"ts\">\nconst file = new URL(`../../../dist/${'index'}.js`, import.meta.url);\n</script>",
    client: `<script setup lang="ts">\nconst file = new URL("../../assets/logo.png", import.meta.url);\n</script>`,
  },
];

for (const { form, file, server, client } of PROBES) {
  await test(`${form} into server code is rejected`, () => {
    const [message, ...rest] = findings(file, server);
    assert.equal(rest.length, 0);
    assert.ok(message?.includes(`server through ${form}.`), message);
  });

  await test(`${form} inside the client layer passes`, () => {
    assert.deepEqual(findings(file, client), []);
  });
}
