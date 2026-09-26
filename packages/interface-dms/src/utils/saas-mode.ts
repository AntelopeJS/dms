import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  GetModuleInfo,
  ListModules,
  type ModuleInfo,
} from "@antelopejs/interface-core/modules";

const SAAS_PACKAGE_NAME = "@antelopejs/dms-saas";
const PACKAGE_SOURCE_TYPE = "package";
const PACKAGE_MANIFEST_FILE = "package.json";

/** Where a loaded module came from: its declared source and its folder on disk. */
export type LoadedModuleOrigin = Pick<ModuleInfo, "source" | "localPath">;

/** The slice of the core module registry SaaS detection reads. */
export interface LoadedModuleRegistry {
  listModules: () => Promise<string[]>;
  getModuleOrigin: (moduleId: string) => Promise<LoadedModuleOrigin>;
}

interface PackageManifest {
  name?: unknown;
}

const coreModuleRegistry: LoadedModuleRegistry = {
  listModules: () => ListModules(),
  getModuleOrigin: (moduleId) => GetModuleInfo(moduleId),
};

let cachedSaasMode: boolean | null = null;

async function readManifestName(folder: string): Promise<string | undefined> {
  try {
    const content = await readFile(
      path.join(folder, PACKAGE_MANIFEST_FILE),
      "utf8",
    );
    const { name } = JSON.parse(content) as PackageManifest;
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the npm package a loaded module was built from. The module id is
 * the key the project chose in its config, so it says nothing about the
 * package: a package source names it directly, any other source (local, git)
 * is read from the module's own manifest.
 */
export async function resolveModulePackageName(
  origin: LoadedModuleOrigin,
): Promise<string | undefined> {
  const { source } = origin;
  if (
    source.type === PACKAGE_SOURCE_TYPE &&
    typeof source.package === "string"
  ) {
    return source.package;
  }
  return readManifestName(origin.localPath);
}

async function isSaasPackage(
  registry: LoadedModuleRegistry,
  moduleId: string,
): Promise<boolean> {
  try {
    const origin = await registry.getModuleOrigin(moduleId);
    return (await resolveModulePackageName(origin)) === SAAS_PACKAGE_NAME;
  } catch {
    // A module unloaded between the listing and the lookup is not loaded.
    return false;
  }
}

/**
 * Records whether `@antelopejs/dms-saas` is loaded, under whatever module id
 * the project registered it (`"dms-saas"`, `"saas"`, ...).
 */
export async function detectSaasMode(
  registry: LoadedModuleRegistry = coreModuleRegistry,
): Promise<void> {
  const moduleIds = await registry.listModules();
  // A module registered under its package name needs no origin lookup.
  if (moduleIds.includes(SAAS_PACKAGE_NAME)) {
    cachedSaasMode = true;
    return;
  }
  const matches = await Promise.all(
    moduleIds.map((moduleId) => isSaasPackage(registry, moduleId)),
  );
  cachedSaasMode = matches.includes(true);
}

export function isSaasMode(): boolean {
  if (cachedSaasMode === null) {
    throw new Error(
      "isSaasMode() called before detectSaasMode() — ensure DMS start() has run.",
    );
  }
  return cachedSaasMode;
}
