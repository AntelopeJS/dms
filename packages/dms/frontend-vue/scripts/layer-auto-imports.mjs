import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const LAYER_ROOT = fileURLToPath(new URL("..", import.meta.url));

const require = createRequire(import.meta.url);

/**
 * @typedef {object} ScannedImport
 * @property {string} name The imported name.
 * @property {string} [as] The name it is auto-imported under.
 */

/**
 * @typedef {object} Unimport
 * @property {() => Promise<ScannedImport[]>} scanImportsFromDir Lists the imports found in the directories.
 */

/**
 * @typedef {object} UnimportOptions
 * @property {string[]} dirs The directories to scan.
 * @property {{ types: boolean, cwd: string }} dirsScanOptions The scan options: whether to include types, and the working directory.
 */

/**
 * @typedef {object} UnimportModule
 * @property {(options: UnimportOptions) => Unimport} createUnimport Creates the importer.
 */

/**
 * @typedef {object} LayerRoot
 * @property {string} id The layer id.
 * @property {string} root The layer root directory.
 */

/**
 * @typedef {object} LayerSetup
 * @property {string} id The layer id.
 * @property {unknown} setup The layer's setup.
 */

/**
 * @typedef {object} FrontendBuildLoader
 * @property {(layers: LayerRoot[], setups: LayerSetup[], fail: (message: string) => never) => string[]} autoImportDirectories Resolves the directories a layer auto-imports from.
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
 * @returns {loaded is FrontendBuildLoader} Whether `loaded` is the module that loads the frontend build.
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
 * @returns {Promise<string[]>} The sorted auto-imported names.
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
