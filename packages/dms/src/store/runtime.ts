import {
  DestroyModule,
  GetModuleInfo,
  ListModules,
  LoadModule,
  StopModule,
} from "@antelopejs/interface-core/modules";
import type { DesiredModule, RuntimeModule } from "./types";

const PACKAGE_SOURCE_TYPE = "package";
const STORE_MODULE_PREFIX = "store-";
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

/** The runtime id of the module the store installs for catalog id `id`. */
export function storeModuleId(id: string): string {
  return `${STORE_MODULE_PREFIX}${id}`;
}

export function isStoreModuleId(moduleId: string): boolean {
  return moduleId.startsWith(STORE_MODULE_PREFIX);
}

export function isLive(module: RuntimeModule | undefined): boolean {
  return module !== undefined && LIVE_STATUSES.has(module.status);
}

async function describeModule(
  moduleId: string,
): Promise<RuntimeModule | undefined> {
  try {
    const info = await GetModuleInfo(moduleId);
    const source = info.source as PackageSource;
    const isPackage = source.type === PACKAGE_SOURCE_TYPE;
    return {
      id: moduleId,
      packageName: isPackage ? source.package : undefined,
      version: isPackage ? source.version : undefined,
      status: info.status,
      localPath: info.localPath,
    };
  } catch {
    return undefined;
  }
}

/**
 * Whether `antelope.config.ts` already declares a module from `packageName`:
 * the store then leaves the package to the config.
 */
export function isDeclaredByConfig(
  runtime: ReadonlyMap<string, RuntimeModule>,
  packageName: string,
): boolean {
  return [...runtime.values()].some(
    (module) =>
      !isStoreModuleId(module.id) && module.packageName === packageName,
  );
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
 * Downloads, constructs and starts the module `entry` describes. A module that
 * fails half-way is destroyed again, so a failed install leaves nothing
 * running.
 */
export async function loadStoreModule(
  id: string,
  entry: DesiredModule,
): Promise<void> {
  const moduleId = storeModuleId(id);
  try {
    await LoadModule(
      moduleId,
      {
        source: {
          type: PACKAGE_SOURCE_TYPE,
          package: entry.package,
          version: entry.version,
        },
        config: entry.config ?? {},
      },
      true,
    );
  } catch (error) {
    await unloadStoreModule(id).catch(() => undefined);
    throw error;
  }
}

/** Stops and destroys the module installed for `id`, when one runs. */
export async function unloadStoreModule(id: string): Promise<void> {
  const moduleId = storeModuleId(id);
  const module = await describeModule(moduleId);
  if (!module) return;
  await StopModule(moduleId);
  await DestroyModule(moduleId);
}
