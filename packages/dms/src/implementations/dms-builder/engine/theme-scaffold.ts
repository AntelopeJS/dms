import fs from "node:fs";
import path from "node:path";
import type {
  OpResult,
  ThemeFiles,
  ThemeLayer,
} from "@antelopejs/interface-dms-builder";
import { attachRollbackErrors, FileBatch } from "./file-batch";
import { commit, unsupported } from "./ops";
import { resolveProjectRoot } from "./project";
import { ENTRY_FILE, scaffoldEntrySource } from "./theme-entry";
import { layerDeclaration, readManifest } from "./theme-declaration";
import {
  emptyLayersDetail,
  proposedLayerPath,
  resolveThemeLayer,
  resolveThemeRoot,
  SCAFFOLD_LAYER_DIRECTORY,
  themeFiles,
} from "./theme-layer";
import { declareLayer } from "./theme-registration";
import {
  openWritableProject,
  resolveRootBarrel,
  Transaction,
} from "./writable";

/**
 * The `@antelopejs/dms-frontend` releases the frontend modules of a theme layer run on, written into
 * the `package.json` of a layer the builder creates.
 */
const FRONTEND_LOADER_RANGE = ">=0.11.4 <0.12.0";

const FALLBACK_PROJECT_NAME = "project";
const LAYER_NAME_SUFFIX = "-frontend";
const INVALID_PACKAGE_NAME_CHARACTERS = /[^a-z0-9-]+/g;
const LOADER_PACKAGE = "@antelopejs/dms-frontend";

/** The project's package name with a suffix: `shop` gives `shop-frontend`. */
function deriveLayerName(root: string): string {
  const projectName = (readManifest(root)?.name ?? FALLBACK_PROJECT_NAME)
    .split("/")
    .pop()
    ?.toLowerCase()
    .replace(INVALID_PACKAGE_NAME_CHARACTERS, "-");
  return `${projectName || FALLBACK_PROJECT_NAME}${LAYER_NAME_SUFFIX}`;
}

/**
 * The layer's `package.json` text. Its `engines` entry names the loader
 * releases it runs on, as the loader asks of every module: the theme needs
 * one that applies a layer's app config itself.
 */
function layerManifest(layerName: string, entryPath: string): string {
  const manifest = {
    name: layerName,
    version: "0.0.0",
    private: true,
    type: "module",
    main: `./${entryPath}`,
    engines: { [LOADER_PACKAGE]: FRONTEND_LOADER_RANGE },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Where the project's entry runs from once built: the directory of its
 * package's `main`, which `__dirname` names at run time. A project without
 * one runs its sources in place.
 */
function runtimeDirectory(root: string, barrelPath: string): string {
  const main = readManifest(root)?.main;
  return main
    ? path.dirname(path.resolve(root, main))
    : path.dirname(barrelPath);
}

/**
 * Skips any file that already exists. The stylesheet starts empty, so the
 * entry's import of it resolves before the first theme is saved.
 */
function stageLayerFiles(
  layerDirectory: string,
  files: ThemeFiles,
  layerName: string,
): FileBatch {
  const batch = new FileBatch();
  const starterFiles: Array<[string, string]> = [
    ["package.json", layerManifest(layerName, files.entryPath)],
    [files.entryPath, scaffoldEntrySource(files.stylesheetPath)],
    [files.stylesheetPath, ""],
  ];
  for (const [relativePath, content] of starterFiles) {
    const filePath = path.join(layerDirectory, relativePath);
    if (!fs.existsSync(filePath)) {
      batch.stageWrite(filePath, content);
    }
  }
  return batch;
}

/**
 * Writes the layer's files and the project's `package.json`, then commits the
 * registration staged in `transaction`. If the registration fails, the files
 * are rolled back, so the project is never left with a layer directory
 * nothing declares.
 */
function writeLayer(
  transaction: Transaction,
  layer: ThemeLayer,
  batch: FileBatch,
): OpResult<ThemeLayer> {
  const fileChanges = batch.flush();
  let registration: OpResult<ThemeLayer>;
  try {
    registration = commit(transaction, layer);
  } catch (error) {
    const rollbackErrors = batch.rollback();
    if (error instanceof Error) {
      attachRollbackErrors(error, rollbackErrors);
    }
    throw error;
  }
  if (!registration.ok) {
    batch.rollback();
    return registration;
  }
  return {
    ...registration,
    changes: [...fileChanges, ...registration.changes],
  };
}

/**
 * Declares `layer` as the project's frontend module (see {@link declareLayer})
 * and writes it with the files staged in `batch`, all or none.
 */
function declareAndWrite(
  layer: ThemeLayer,
  batch: FileBatch,
): OpResult<ThemeLayer> {
  const root = resolveProjectRoot();
  const project = openWritableProject();
  const barrel = resolveRootBarrel(project);
  if (!barrel) {
    return unsupported(
      "the project has no src/index.ts to register a frontend layer from",
    );
  }
  const transaction = new Transaction(project);
  const declaration = declareLayer(project, transaction, barrel, root, {
    name: layer.name,
    runtimeRelativePath: path
      .relative(runtimeDirectory(root, barrel.getFilePath()), layer.sourcePath)
      .split(path.sep)
      .join("/"),
  });
  if (!declaration.ok) {
    transaction.rollback();
    return unsupported(declaration.detail);
  }
  const errors = transaction.typecheckErrors();
  if (errors.length > 0) {
    transaction.rollback();
    return {
      ok: false,
      error: { code: "typecheck_failed", diagnostics: errors },
    };
  }
  batch.stageWrite(declaration.manifest.path, declaration.manifest.text);
  return writeLayer(transaction, layer, batch);
}

/**
 * Creates the project's frontend layer (`frontend-vue/` at the project root,
 * with a `package.json`, an entry and an empty stylesheet) and declares it as
 * the project's frontend module, registered from `start()`, above the DMS.
 * Files already in the directory are kept, and a project that already
 * declares it is left as it is.
 */
export function scaffoldThemeLayer(): OpResult<ThemeLayer> {
  const layerDirectory = proposedLayerPath();
  const themeRelativeDirectory = resolveThemeRoot(layerDirectory);
  if (themeRelativeDirectory === undefined) {
    return unsupported(emptyLayersDetail(layerDirectory));
  }
  const layer = {
    name: deriveLayerName(resolveProjectRoot()),
    sourcePath: layerDirectory,
  };
  return declareAndWrite(
    layer,
    stageLayerFiles(
      layerDirectory,
      themeFiles(themeRelativeDirectory),
      layer.name,
    ),
  );
}

/**
 * A project that has no layer gets one. A layer the project registers without
 * declaring it, which no frontend loads, is declared. A layer that is
 * declared is returned, and nothing is written.
 */
export async function createThemeLayer(): Promise<OpResult<ThemeLayer>> {
  const existing = await resolveThemeLayer();
  if (!existing) {
    return scaffoldThemeLayer();
  }
  const entry = path.join(existing.sourcePath, ENTRY_FILE);
  if (!fs.statSync(entry, { throwIfNoEntry: false })?.isFile()) {
    return unsupported(
      `the layer at ${existing.sourcePath} has no ${ENTRY_FILE}: create the layer there, or remove the module config's theme.layerPath for the builder to create ${SCAFFOLD_LAYER_DIRECTORY}/`,
    );
  }
  if (layerDeclaration(existing).declared) {
    return { ok: true, data: existing, changes: [] };
  }
  return declareAndWrite(existing, new FileBatch());
}
