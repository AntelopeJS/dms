import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const LAYER_ROOT = fileURLToPath(new URL("..", import.meta.url));

const require = createRequire(import.meta.url);

/**
 * @typedef {object} ScannedImport
 * @property {string} name
 * @property {string} [as]
 */

/**
 * @typedef {object} Unimport
 * @property {() => Promise<ScannedImport[]>} scanImportsFromDir
 */

/**
 * @typedef {object} UnimportOptions
 * @property {string[]} dirs
 * @property {{ types: boolean, cwd: string }} dirsScanOptions
 */

/**
 * @typedef {object} UnimportModule
 * @property {(options: UnimportOptions) => Unimport} createUnimport
 */

/**
 * @typedef {object} LayerRoot
 * @property {string} id
 * @property {string} root
 */

/**
 * @typedef {object} LayerSetup
 * @property {string} id
 * @property {unknown} setup
 */

/**
 * @typedef {object} FrontendBuildLoader
 * @property {(layers: LayerRoot[], setups: LayerSetup[], fail: (message: string) => never) => string[]} autoImportDirectories
 */

/** @type {(id: string) => UnimportModule} */
const requireFromAutoImport = createRequire(
  require.resolve("unplugin-auto-import"),
);
const { createUnimport } = requireFromAutoImport("unimport");
const jiti = createJiti(import.meta.url, {
  alias: {
    "#dms/frontend-build": require.resolve(
      "@antelopejs/dms-frontend/templates/vue/frontend-build.ts",
    ),
  },
});

/**
 * @param {unknown} loaded
 * @returns {loaded is FrontendBuildLoader}
 */
function isFrontendBuildLoader(loaded) {
  return (
    loaded instanceof Object &&
    "autoImportDirectories" in loaded &&
    loaded.autoImportDirectories instanceof Function
  );
}

/**
 * Every name the DMS renderer auto-imports from the directories this layer
 * declares in `dms.frontend.build.ts`, types included, sorted. It runs the
 * renderer's own directory resolution and the auto-importer's own scanner.
 * @returns {Promise<string[]>}
 */
export async function layerAutoImportNames() {
  const loader = await jiti.import(
    "@antelopejs/dms-frontend/templates/vue/frontend-build-loader.ts",
  );
  if (!isFrontendBuildLoader(loader))
    throw new Error(
      "frontend-build-loader.ts does not export autoImportDirectories",
    );
  const { autoImportDirectories } = loader;
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
  return [...new Set(imports.map((entry) => entry.as ?? entry.name))].sort(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  );
}
