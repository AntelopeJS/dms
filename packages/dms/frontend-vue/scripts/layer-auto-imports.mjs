import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const LAYER_ROOT = fileURLToPath(new URL("..", import.meta.url));

const require = createRequire(import.meta.url);
const { createUnimport } = createRequire(
  require.resolve("unplugin-auto-import"),
)("unimport");
const jiti = createJiti(import.meta.url, {
  alias: {
    "#dms/frontend-build": require.resolve(
      "@antelopejs/dms-frontend/templates/vue/frontend-build.ts",
    ),
  },
});

/**
 * Every name the DMS renderer auto-imports from the directories this layer
 * declares in `dms.frontend.build.ts`, types included, sorted. It runs the
 * renderer's own directory resolution and the auto-importer's own scanner.
 * @returns {Promise<string[]>}
 */
export async function layerAutoImportNames() {
  const { autoImportDirectories } = await jiti.import(
    "@antelopejs/dms-frontend/templates/vue/frontend-build-loader.ts",
  );
  const setup = await jiti.import("../dms.frontend.build.ts", {
    default: true,
  });
  const unimport = createUnimport({
    dirs: autoImportDirectories(
      [{ id: "dms", root: LAYER_ROOT }],
      [{ id: "dms", setup }],
      (message) => {
        throw new Error(message);
      },
    ),
    dirsScanOptions: { types: true, cwd: LAYER_ROOT },
  });
  const imports = await unimport.scanImportsFromDir();
  return [...new Set(imports.map((entry) => entry.as ?? entry.name))].sort();
}
