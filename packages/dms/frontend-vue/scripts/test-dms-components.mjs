import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDmsComponents } from "./check-dms-components.mjs";

const NODE_MODULES = fileURLToPath(new URL("../node_modules", import.meta.url));

const FIXTURE_FILES = {
  "package.json": "{}",
  "dms.frontend.ts": [
    'const PREFIX = "DmsAcme";',
    "export default {",
    "  componentPrefix: PREFIX,",
    '  setup(sdk) { sdk.registerComponent("extra-panel", {}); },',
    "};",
  ].join("\n"),
  "app/components/StatusBoard.vue": "<template><div /></template>",
  "app/custom-layouts/Board.vue": "<template><div /></template>",
};

async function diagnose({ screen = "<div />", script = "", backend = "" }) {
  const layer = mkdtempSync(join(tmpdir(), "dms-components-"));
  try {
    symlinkSync(NODE_MODULES, join(layer, "node_modules"), "junction");
    const files = {
      ...FIXTURE_FILES,
      "app/pages/Screen.vue": [
        "<script setup>",
        'import DmsLocalPanel from "./DmsLocalPanel.vue";',
        script,
        "</script>",
        "<template>",
        screen,
        "</template>",
      ].join("\n"),
      "src/pages/home.ts": backend,
      "src/pages/home.test.ts": 'CustomComponent("DmsCard");',
    };
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(layer, file)), { recursive: true });
      writeFileSync(join(layer, file), content);
    }
    const shown = relative(process.cwd(), layer).length + 1;
    const diagnostics = await checkDmsComponents({
      layer,
      sources: [join(layer, "src")],
    });
    return diagnostics.map((line) =>
      line
        .slice(shown)
        .replaceAll("\\", "/")
        .replace(/` is no component .*$/, "`"),
    );
  } finally {
    rmSync(layer, { recursive: true, force: true });
  }
}

assert.deepEqual(await diagnose({ screen: "<DmsCard />" }), [
  "app/pages/Screen.vue:6: `DmsCard`",
]);
assert.deepEqual(await diagnose({ screen: "<DmsCardPanel />" }), []);

assert.deepEqual(
  await diagnose({
    screen: [
      "<div>",
      "  <dms-card />",
      '  <component is="DmsBanner" />',
      "  <DmsAcmeNoSuchPanel />",
      "  <DmsCardpanel />",
      "  <DmsDefaultLayout />",
      "</div>",
    ].join("\n"),
    script: 'const card = resolveComponent("DmsSelect");',
  }),
  [
    "app/pages/Screen.vue:7: `dms-card`",
    "app/pages/Screen.vue:8: `DmsBanner`",
    "app/pages/Screen.vue:9: `DmsAcmeNoSuchPanel`",
    "app/pages/Screen.vue:10: `DmsCardpanel`",
    "app/pages/Screen.vue:11: `DmsDefaultLayout`",
    "app/pages/Screen.vue:3: `DmsSelect`",
  ],
);
assert.deepEqual(
  await diagnose({
    screen: [
      "<div>",
      "  <dms-card-panel />",
      '  <component is="DmsNoticeBanner" />',
      "  <DmsAcmeStatusBoard />",
      "  <DmsAcmeExtraPanel />",
      "  <DmsLocalPanel />",
      "  <dms-local-panel />",
      "  <DmsLazyPanel />",
      "  <DmsLink />",
      "  <DmsSectionBlock />",
      "</div>",
    ].join("\n"),
    script: [
      "const DmsLazyPanel = defineAsyncComponent(() => import('./Panel.vue'));",
      'const card = resolveComponent("DmsInputSelect");',
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
      'const notice = { key: "trial", variant: "info", component: "DmsAcmeNoSuchBanner" };',
      'const NAME = "dms-select";',
      "const field = new ComponentBuilder(NAME);",
      "const input = CustomComponent(`DmsTextarea` as const);",
    ].join("\n"),
  }),
  [
    "src/pages/home.ts:1: `DmsCard`",
    "src/pages/home.ts:2: `dms-banner`",
    "src/pages/home.ts:3: `DmsEyebrow`",
    "src/pages/home.ts:4: `DmsAcmeNoSuchBanner`",
    "src/pages/home.ts:6: `dms-select`",
    "src/pages/home.ts:7: `DmsTextarea`",
  ],
);
assert.deepEqual(
  await diagnose({
    backend: [
      'const card = CustomComponent("DmsCardPanel");',
      'const banner = new ComponentBuilder("dms-notice-banner");',
      'const layout = { componentName: "dms-default-layout" };',
      'const board = { componentName: "dms-board" };',
      'const notice = { key: "trial", variant: "info", component: "DmsAcmeStatusBoard" };',
      'const extra = CustomComponent("dms-acme-extra-panel");',
      'const logger = child({ component: "dms-mailing" });',
      'const database = connect("dms-database");',
    ].join("\n"),
  }),
  [],
);
