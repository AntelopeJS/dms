import fs from "node:fs";
import path from "node:path";
import {
  type FrontendModuleMetadata,
  GetFrontendModules,
} from "@antelopejs/interface-dms/page";
import type { ThemeFiles, ThemeLayer } from "@antelopejs/interface-dms-builder";
import { getBuilderConfig } from "../../../config";
import { resolveProjectRoot } from "./project";
import { APP_CONFIG_FILE } from "./theme-app-config";
import { LOGO_UPLOAD_DIRECTORY, PUBLIC_DIRECTORY } from "./theme-assets";
import { ENTRY_FILE, STYLESHEET_FILE } from "./theme-entry";

const DEPENDENCY_DIRECTORY = "node_modules";
/**
 * Hidden directories hold tooling output, not project code: AntelopeJS
 * installs packaged modules, the DMS included, under `.antelope/cache` inside
 * the project root.
 */
const HIDDEN_DIRECTORY = /^\./;

/** Where a frontend module keeps its layers, when it is split into several. */
const LAYERS_DIRECTORY = "layers";

/** Where a layer the builder creates goes, relative to the project root. */
export const SCAFFOLD_LAYER_DIRECTORY = "frontend-vue";

/** Absolute path where `CreateThemeLayer` would create the layer. */
export function proposedLayerPath(): string {
  return path.join(resolveProjectRoot(), SCAFFOLD_LAYER_DIRECTORY);
}

function isProjectSource(projectRoot: string, directory: string): boolean {
  const relative = path.relative(projectRoot, directory);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return false;
  }
  return !relative
    .split(path.sep)
    .some(
      (segment) =>
        segment === DEPENDENCY_DIRECTORY || HIDDEN_DIRECTORY.test(segment),
    );
}

function configuredLayer(projectRoot: string): ThemeLayer | undefined {
  const configuredPath = getBuilderConfig().theme?.layerPath;
  if (!configuredPath) {
    return undefined;
  }
  const sourcePath = path.resolve(projectRoot, configuredPath);
  return { name: path.basename(sourcePath), sourcePath };
}

type RegisteredModule = Pick<
  FrontendModuleMetadata,
  "name" | "sourcePath" | "priority"
>;

function byPriority(left: RegisteredModule, right: RegisteredModule): number {
  return right.priority - left.priority;
}

/**
 * The highest-priority frontend module registered from inside the project
 * root. The DMS and installed modules register from `node_modules`,
 * AntelopeJS's cache or a checkout elsewhere, none of which the builder may
 * rewrite.
 */
export function projectLayer(
  projectRoot: string,
  modules: RegisteredModule[],
): ThemeLayer | undefined {
  const own = modules
    .filter((module) => isProjectSource(projectRoot, module.sourcePath))
    .sort(byPriority)[0];
  return own ? { name: own.name, sourcePath: own.sourcePath } : undefined;
}

/** The frontend layer the project's theme lives in: the configured one, else its own. */
export async function resolveThemeLayer(): Promise<ThemeLayer | undefined> {
  const projectRoot = resolveProjectRoot();
  return (
    configuredLayer(projectRoot) ??
    projectLayer(projectRoot, await GetFrontendModules())
  );
}

function isDirectory(directory: string): boolean {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The directory, relative to the layer, that the DMS frontend loader reads
 * the app config and `public/` from: `""` (the layer itself), or, when the
 * layer has a `layers/` directory, the last layer in it by name. The loader
 * then reads only those layers, and the last one wins (`moduleAssetRoots` in
 * `@antelopejs/dms-frontend`). Undefined when `layers/` holds no directory or
 * cannot be read.
 */
export function resolveThemeRoot(sourcePath: string): string | undefined {
  const layersDirectory = path.join(sourcePath, LAYERS_DIRECTORY);
  if (!fs.existsSync(layersDirectory)) {
    return "";
  }
  let names: string[];
  try {
    names = fs.readdirSync(layersDirectory).sort();
  } catch {
    return undefined;
  }
  const lastLayer = names
    .filter((name) => isDirectory(path.join(layersDirectory, name)))
    .pop();
  return lastLayer === undefined
    ? undefined
    : path.posix.join(LAYERS_DIRECTORY, lastLayer);
}

/**
 * The `unsupported` detail when `resolveThemeRoot` finds no layer in
 * `layers/`.
 */
export function emptyLayersDetail(sourcePath: string): string {
  return `${path.join(sourcePath, LAYERS_DIRECTORY)} holds no layer: the DMS frontend loader reads a module that has a ${LAYERS_DIRECTORY}/ directory from the layers in it alone, so a theme written anywhere else would never apply. Add a layer directory to it, or remove it.`;
}

export function themeFiles(themeRoot: string): ThemeFiles {
  return {
    stylesheetPath: path.posix.join(themeRoot, STYLESHEET_FILE),
    appConfigPath: path.posix.join(themeRoot, APP_CONFIG_FILE),
    entryPath: ENTRY_FILE,
    assetsDirectory: path.posix.join(
      themeRoot,
      PUBLIC_DIRECTORY,
      LOGO_UPLOAD_DIRECTORY,
    ),
  };
}
