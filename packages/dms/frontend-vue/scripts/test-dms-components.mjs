import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDmsComponents } from "./check-dms-components.mjs";

const FIXTURE_FILES = {
  "package.json": "{}",
  "dms.frontend.ts": `export default { componentPrefix: "DmsAcme", setup() {} };`,
  "app/components/StatusBoard.vue": "<template><div /></template>",
};

async function diagnose({ screen = "<div />", backend = "" }) {
  const layer = mkdtempSync(
    fileURLToPath(new URL("../.dms-components-fixture-", import.meta.url)),
  );
  try {
    const files = {
      ...FIXTURE_FILES,
      "app/pages/Screen.vue": [
        "<script setup>",
        'import DmsLocalPanel from "./DmsLocalPanel.vue";',
        "</script>",
        "<template>",
        screen,
        "</template>",
      ].join("\n"),
      "src/pages/home.ts": backend,
    };
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(layer, file)), { recursive: true });
      writeFileSync(join(layer, file), content);
    }
    const shown = `${relative(process.cwd(), layer)}/`;
    const diagnostics = await checkDmsComponents({
      layer,
      sources: [join(layer, "src")],
    });
    return diagnostics.map((line) =>
      line.slice(shown.length).replace(/` is no component .*$/, "`"),
    );
  } finally {
    rmSync(layer, { recursive: true, force: true });
  }
}

assert.deepEqual(await diagnose({ screen: "<DmsCard />" }), [
  "app/pages/Screen.vue:5: `DmsCard`",
]);
assert.deepEqual(await diagnose({ screen: "<DmsCardPanel />" }), []);

assert.deepEqual(
  await diagnose({
    screen: [
      "<div>",
      "  <dms-card />",
      '  <component is="DmsBanner" />',
      "  <DmsAcmeNoSuchPanel />",
      "</div>",
    ].join("\n"),
  }),
  [
    "app/pages/Screen.vue:6: `dms-card`",
    "app/pages/Screen.vue:7: `DmsBanner`",
    "app/pages/Screen.vue:8: `DmsAcmeNoSuchPanel`",
  ],
);
assert.deepEqual(
  await diagnose({
    screen: [
      "<div>",
      "  <dms-card-panel />",
      '  <component is="DmsNoticeBanner" />',
      "  <DmsAcmeStatusBoard />",
      "  <DmsLocalPanel />",
      "  <dms-local-panel />",
      "  <DmsLink />",
      "  <DmsSectionBlock />",
      "</div>",
    ].join("\n"),
  }),
  [],
);

assert.deepEqual(
  await diagnose({
    backend: [
      'const card = CustomComponent("DmsCard");',
      'const banner = new ComponentBuilder("dms-banner");',
      'const layout = { componentName: "DmsEyebrow" };',
      'const notice = { component: "DmsAcmeNoSuchBanner" };',
    ].join("\n"),
  }),
  [
    "src/pages/home.ts:1: `DmsCard`",
    "src/pages/home.ts:2: `dms-banner`",
    "src/pages/home.ts:3: `DmsEyebrow`",
    "src/pages/home.ts:4: `DmsAcmeNoSuchBanner`",
  ],
);
assert.deepEqual(
  await diagnose({
    backend: [
      'const card = CustomComponent("DmsCardPanel");',
      'const banner = new ComponentBuilder("dms-notice-banner");',
      'const layout = { componentName: "dms-default-layout" };',
      'const notice = { component: "DmsAcmeStatusBoard" };',
      'const database = connect("dms-database");',
    ].join("\n"),
  }),
  [],
);
