import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(frontend, "../../..");
const scratch = mkdtempSync(join(tmpdir(), "frontend-autoimport-tests-"));
const pkg = join(scratch, "packages/dms/frontend-vue");
const app = "layers/dms-core/app";
const require = createRequire(import.meta.url);
const { createServer } = require("vite");
const vue = require("@vitejs/plugin-vue").default;
const { createSSRApp } = require("vue");
const { renderToString } = require("vue/server-renderer");
const autoImport = require("unplugin-auto-import/vite");

function write(file, text) {
  const target = join(pkg, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return target;
}

function run() {
  return spawnSync(
    process.execPath,
    [join(pkg, "scripts/check-autoimport-boundaries.mjs")],
    { encoding: "utf8", timeout: 30000 },
  );
}

async function viteControl(file, verify, plugins) {
  const server = await createServer({
    root: pkg,
    configFile: false,
    plugins,
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true, watch: null },
  });
  try {
    await verify(await server.ssrLoadModule("/" + file));
  } finally {
    await server.close();
  }
}

try {
  mkdirSync(join(pkg, "scripts"), { recursive: true });
  symlinkSync(join(frontend, "node_modules"), join(pkg, "node_modules"));
  symlinkSync(join(root, "node_modules"), join(scratch, "node_modules"));
  mkdirSync(join(scratch, ".dependency-cruiser"));
  cpSync(
    join(root, ".dependency-cruiser/frontend.cjs"),
    join(scratch, ".dependency-cruiser/frontend.cjs"),
  );
  cpSync(
    join(frontend, "scripts/check-autoimport-boundaries.mjs"),
    join(pkg, "scripts/check-autoimport-boundaries.mjs"),
  );
  write("package.json", '{"type":"module"}');
  write(
    "dms.frontend.build.ts",
    'build.registerAutoImports(["layers/*/app/composables", "layers/*/app/utils", "layers/*/app/types"]);',
  );
  write(
    "dms.frontend.ts",
    'import { buildComponents } from "./layers/dms-layout/app/entries/component-registry"; const components = { ...import.meta.glob("./layers/*/app/components/**/*.vue"), ...buildComponents };',
  );
  write(
    "layers/dms-layout/app/entries/component-registry.ts",
    'const components = import.meta.glob("../build/components/**/*.vue"); export const buildComponents = Object.fromEntries(Object.entries(components));',
  );
  write(
    "layers/dms-layout/app/build/components/DashboardHeader.vue",
    "<template><header /></template>",
  );
  write(
    "layers/dms-ui/app/components/Entry.vue",
    "<template><div /></template>",
  );
  assert.equal(run().status, 0, "allowed template owner control");
  write(
    "layers/dms-ui/app/components/Entry.vue",
    "<template><DashboardHeader /></template>",
  );
  await viteControl(
    "layers/dms-ui/app/components/Entry.vue",
    async (actual) => {
      const app = createSSRApp(actual.default);
      app.component("DashboardHeader", {
        template: "<header>CONTROL_OK</header>",
      });
      assert.match(await renderToString(app), /<header>CONTROL_OK<\/header>/);
    },
    [vue()],
  );
  const templateResult = run();
  assert.equal(templateResult.status, 1, templateResult.stderr);
  assert.match(templateResult.stderr, /DashboardHeader/);
  console.log("PASS reject UI DashboardHeader template owner");
  write(
    "layers/dms-ui/app/components/Entry.vue",
    "<script setup>const DashboardHeader = {};</script><template><DashboardHeader /></template>",
  );
  assert.equal(run().status, 0, "locally bound template component");
  rmSync(join(pkg, "layers"), { recursive: true, force: true });
  mkdirSync(join(pkg, app), { recursive: true });
  write(
    "dms.frontend.ts",
    'const components = import.meta.glob("./layers/*/app/components/**/*.vue");',
  );
  write(
    "layers/dms-layout/app/composables/useHigher.ts",
    "export const useHigher = () => 1;",
  );
  write(`${app}/entry.ts`, "export const value = useHigher();");
  await viteControl(
    `${app}/entry.ts`,
    (actual) => assert.equal(actual.value, 1),
    [
      autoImport({
        dirs: [join(pkg, "layers/*/app/composables/**")],
        dts: false,
      }),
    ],
  );
  const autoResult = run();
  assert.equal(autoResult.status, 1, autoResult.stderr);
  assert.match(autoResult.stderr, /useHigher/);
  console.log("PASS reject generated auto-import owner");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
