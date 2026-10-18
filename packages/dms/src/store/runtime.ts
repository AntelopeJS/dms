import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DestroyModule,
  GetModuleInfo,
  ListModules,
  LoadModule,
  StopModule,
} from "@antelopejs/interface-core/modules";
import type { RuntimeModule } from "./types";

const PACKAGE_SOURCE_TYPE = "package";
const PACKAGE_JSON = "package.json";
/**
 * Statuses of a module that still holds an instance. A destroyed one is back
 * to `loaded`: its code stays in the registry until the process restarts, but
 * it runs nothing.
 */
const LIVE_STATUSES = new Set(["constructed", "active"]);

interface PackageSource {
  type: string;
  package?: string;
  version?: string;
}

interface PackageManifest {
  name?: string;
  version?: string;
}

/** What the store loads: a catalog package, at a version range. */
export interface StoreModuleLoad {
  package: string;
  range: string;
  config?: unknown;
}

export function isLive(module: RuntimeModule | undefined): boolean {
  return module !== undefined && LIVE_STATUSES.has(module.status);
}

/** The manifest of the folder the module was loaded from, read from disk. */
async function loadedManifest(localPath: string): Promise<PackageManifest> {
  try {
    return JSON.parse(
      await readFile(path.join(localPath, PACKAGE_JSON), "utf-8"),
    ) as PackageManifest;
  } catch {
    return {};
  }
}

async function describeModule(
  moduleId: string,
): Promise<RuntimeModule | undefined> {
  try {
    const info = await GetModuleInfo(moduleId);
    const source = info.source as PackageSource;
    const isPackage = source.type === PACKAGE_SOURCE_TYPE;
    const manifest = await loadedManifest(info.localPath);
    return {
      id: moduleId,
      // A local or git working copy names its package in its manifest.
      packageName: isPackage ? source.package : manifest.name,
      version: manifest.version,
      isPackageSource: isPackage,
      status: info.status,
      localPath: info.localPath,
    };
  } catch {
    return undefined;
  }
}

/**
 * The running module loaded from a local folder or git rather than npm whose
 * manifest names `packageName`: a developer's working copy of a catalog
 * module, which the store shows as running but leaves alone.
 */
export function findWorkingCopy(
  packageName: string,
  runtime: Iterable<RuntimeModule>,
): RuntimeModule | undefined {
  for (const module of runtime) {
    if (module.isPackageSource || module.packageName !== packageName) continue;
    if (isLive(module)) return module;
  }
  return undefined;
}

/** Every module the runtime holds, by runtime id. */
export async function listRuntimeModules(): Promise<
  Map<string, RuntimeModule>
> {
  const described = await Promise.all(
    (await ListModules()).map((moduleId) => describeModule(moduleId)),
  );
  return new Map(
    described
      .filter((module): module is RuntimeModule => module !== undefined)
      .map((module) => [module.id, module]),
  );
}

/**
 * Downloads, constructs and starts `load` as module `moduleId`, the key of
 * its entry in antelope.config.ts, so the core loads it under the same id at
 * the next start. A module that fails half-way is destroyed again.
 */
export async function loadStoreModule(
  moduleId: string,
  load: StoreModuleLoad,
): Promise<void> {
  try {
    await LoadModule(
      moduleId,
      {
        source: {
          type: PACKAGE_SOURCE_TYPE,
          package: load.package,
          version: load.range,
        },
        config: load.config ?? {},
      },
      true,
    );
  } catch (error) {
    await unloadStoreModule(moduleId).catch(() => undefined);
    throw error;
  }
}

/** Stops and destroys module `moduleId`, when the runtime holds it. */
export async function unloadStoreModule(moduleId: string): Promise<void> {
  const module = await describeModule(moduleId);
  if (!module) return;
  await StopModule(moduleId);
  await DestroyModule(moduleId);
}

export async function describeRuntimeModule(
  moduleId: string,
): Promise<RuntimeModule | undefined> {
  return describeModule(moduleId);
}
