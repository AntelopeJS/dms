import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const SIBLINGS_ROOT = resolve(PACKAGE_ROOT, "..", "..", "..");
const ADAPTER_ROOT = resolve(
  process.env.DMS_INERTIA_ROOT ?? join(SIBLINGS_ROOT, "dms-frontend"),
);
const MODULES_ROOT = resolve(
  process.env.DMS_MODULES_ROOT ?? join(SIBLINGS_ROOT, "dms-modules"),
);
const moduleSources = readdirSync(MODULES_ROOT)
  .sort()
  .map((name) => join(MODULES_ROOT, name, "frontend-vue"))
  .filter((root) => existsSync(join(root, "dms.frontend.ts")));

if (!moduleSources.length) throw new Error(`No Vue modules in ${MODULES_ROOT}`);
console.log(`Checking DMS with ${moduleSources.length} local Vue modules.`);
const result = spawnSync("pnpm", ["test:real-source"], {
  cwd: ADAPTER_ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    DMS_LAYER_SOURCE: join(PACKAGE_ROOT, "frontend-vue"),
    DMS_MODULE_SOURCES: JSON.stringify(moduleSources),
    DMS_LOCAL_PACKAGES: JSON.stringify({
      "@antelopejs/dms": PACKAGE_ROOT,
      "@antelopejs/interface-dms": join(PACKAGE_ROOT, "..", "interface-dms"),
      ...JSON.parse(process.env.DMS_LOCAL_PACKAGES ?? "{}"),
    }),
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
