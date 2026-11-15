import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertDmsComponents,
  checkDmsComponents,
} from "./check-dms-components.mjs";
import { z } from "zod";

const RENDERER_RANGE = z
  .object({ engines: z.object({ "@antelopejs/dms-frontend": z.string() }) })
  .parse(
    JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ),
  ).engines["@antelopejs/dms-frontend"];

const NODE_MODULES = fileURLToPath(new URL("../node_modules", import.meta.url));

const FIXTURE_FILES = {
  "frontend-vue/package.json": "{}",
  "frontend-vue/dms.frontend.ts": [
    'const PREFIX = "DmsAcme";',
    "export default {",
    "  componentPrefix: PREFIX,",
    "  setup(sdk) {",
    '    sdk.registerComponent("extra-panel", {});',
    '    sdk.registerComponent("DmsAcmeRawPanel", {}, { prefix: false });',
    '    sdk.registerComponent("DmsChip", {});',
    "  },",
    "};",
    "const other = { componentPrefix: this.componentPrefix };",
  ].join("\n"),
  "frontend-vue/app/components/StatusBoard.vue": "<template><div /></template>",
  "frontend-vue/app/custom-layouts/Board.vue": "<template><div /></template>",
};

async function diagnose({
  screen = "<div />",
  script = "",
  backend = "",
  renderer = true,
  asserted = false,
}) {
  const module = mkdtempSync(join(tmpdir(), "dms-components-"));
  const layer = join(module, "frontend-vue");
  try {
    mkdirSync(layer);
    if (renderer)
      symlinkSync(NODE_MODULES, join(layer, "node_modules"), "junction");
    const files = {
      ...FIXTURE_FILES,
      "frontend-vue/app/pages/Screen.vue": [
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
      mkdirSync(dirname(join(module, file)), { recursive: true });
      writeFileSync(join(module, file), content);
    }
    const shown = relative(process.cwd(), module).length + 1;
    const options = { layer, sources: [join(module, "src")] };
    if (asserted)
      return await assertDmsComponents(options).then(
        () => [],
        (error) => error.message.replaceAll(layer, "<layer>").split("\n"),
      );
    const diagnostics = await checkDmsComponents(options);
    return diagnostics.map((line) =>
      line
        .slice(shown)
        .replaceAll("\\", "/")
        .replace(/^frontend-vue\//, "")
        .replace(/` is no component .*$/, "`"),
    );
  } finally {
    rmSync(module, { recursive: true, force: true });
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
      "  <DmsChip />",
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
    "app/pages/Screen.vue:12: `DmsChip`",
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
      "  <DmsPickedPanel />",
      "  <DmsAcmeRawPanel />",
      "  <DmsLink />",
      "  <DmsSectionBlock />",
      "</div>",
    ].join("\n"),
    script: [
      "const DmsLazyPanel = defineAsyncComponent(() => import('./Panel.vue'));",
      "const { DmsPickedPanel } = panels;",
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
      'const board = CustomComponent("DmsBoard");',
      'const componentName = "DmsMeter";',
      "const info = { componentName };",
      'function make() { const INNER = "DmsChip"; return CustomComponent(INNER); }',
    ].join("\n"),
  }),
  [
    "src/pages/home.ts:1: `DmsCard`",
    "src/pages/home.ts:2: `dms-banner`",
    "src/pages/home.ts:3: `DmsEyebrow`",
    "src/pages/home.ts:4: `DmsAcmeNoSuchBanner`",
    "src/pages/home.ts:6: `dms-select`",
    "src/pages/home.ts:7: `DmsTextarea`",
    "src/pages/home.ts:8: `DmsBoard`",
    "src/pages/home.ts:10: `DmsMeter`",
    "src/pages/home.ts:11: `DmsChip`",
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
      'const component = "dms-mailing";',
      "log.child({ component });",
      "export function build(component) { return CustomComponent(component); }",
    ].join("\n"),
  }),
  [],
);

assert.deepEqual(
  await diagnose({
    screen: "<DmsCardPanel />",
    renderer: false,
    asserted: true,
  }),
  [],
);
const missingRenderer =
  (
    await diagnose({ screen: "<DmsLink />", renderer: false, asserted: true })
  ).at(-1) ?? "";
assert.match(
  missingRenderer,
  /^@antelopejs\/dms-frontend is not installed in <layer>, so the components its renderer registers, such as DmsLink, count as unknown\. If the layer uses one, run in <layer>: \S+ (?:add|install) -[Dd] "@antelopejs\/dms-frontend@[^"]+"$/,
);
assert.ok(
  missingRenderer.endsWith(`"@antelopejs/dms-frontend@${RENDERER_RANGE}"`),
  missingRenderer,
);
assert.deepEqual(await diagnose({ screen: "<DmsLink />", asserted: true }), []);

/** Installs of typescript and vue whose entry is missing: resolution stops at them and fails, whatever the host has above. */
const BROKEN_PARSERS = {
  "node_modules/typescript/package.json": { main: "missing.js" },
  "node_modules/vue/package.json": {
    exports: { "./compiler-sfc": "./missing.js" },
  },
};

async function checkWithoutParsers() {
  const root = mkdtempSync(join(tmpdir(), "dms-components-parsers-"));
  try {
    for (const [file, manifest] of Object.entries(BROKEN_PARSERS)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), JSON.stringify(manifest));
    }
    const frontend = join(root, "dms", "frontend-vue");
    mkdirSync(join(frontend, "scripts"), { recursive: true });
    for (const file of [
      "scripts/check-dms-components.mjs",
      "scripts/dms-components-dependencies.mjs",
      "package.json",
    ])
      copyFileSync(
        new URL(`../${file}`, import.meta.url),
        join(frontend, file),
      );
    copyFileSync(
      new URL("../../package.json", import.meta.url),
      join(root, "dms", "package.json"),
    );
    const layer = join(root, "layer");
    mkdirSync(layer);
    writeFileSync(join(layer, "package.json"), "{}");
    const copy = await import(
      pathToFileURL(join(frontend, "scripts", "check-dms-components.mjs")).href
    );
    return await copy.checkDmsComponents({ layer }).then(
      () => "",
      (error) => error.message.replaceAll(layer, "<layer>"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

assert.match(
  await checkWithoutParsers(),
  /^The DMS component check parses the layer with typescript and vue, and typescript and vue cannot be resolved from <layer>\. In <layer>, run: \S+ (?:add|install) -[Dd] "typescript@>=5\.8\.0 <7\.0\.0" "vue@\^3\.5\.0"$/,
);
