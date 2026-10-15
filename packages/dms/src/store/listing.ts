import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { gt, valid } from "semver";
import { isStoreEditable } from "../config";
import { frontendModuleNamesUnder } from "../implementations/dms/frontend-modules";
import {
  type FrontendAcknowledgement,
  getFrontendAcknowledgement,
} from "../implementations/dms/frontend-ready";
import { loadStoreCatalog } from "./catalog";
import { installedInterfaceVersion, isCompatible } from "./compatibility";
import { readDesiredState, stateFileName } from "./desired-state";
import { currentOperation, removedLayerNames, storeError } from "./operations";
import { latestRelease } from "./registry";
import {
  isDeclaredByConfig,
  isLive,
  listRuntimeModules,
  storeModuleId,
} from "./runtime";
import type {
  DesiredState,
  PackageRelease,
  RuntimeModule,
  StoreCatalogEntry,
  StoreFrontendState,
  StoreListing,
  StoreListingEntry,
  StoreModuleState,
} from "./types";

const CATALOG_I18N_PREFIX = "$modules.store.catalog";

/** What one listing entry is computed from. */
interface EntrySources {
  catalogEntry: StoreCatalogEntry;
  state: DesiredState;
  runtime: ReadonlyMap<string, RuntimeModule>;
  release: PackageRelease | undefined;
  interfaceVersion: string;
  acknowledgement: FrontendAcknowledgement | undefined;
}

interface DesiredStateRead {
  state: DesiredState;
  error?: string;
}

function resolveState(sources: EntrySources): StoreModuleState {
  const { id, package: packageName } = sources.catalogEntry;
  if (currentOperation()?.moduleId === id) return "busy";
  if (isDeclaredByConfig(sources.runtime, packageName)) return "config";
  const desired = sources.state.modules[id];
  if (storeError(id)) return "error";
  if (!desired) return "available";
  const live = isLive(sources.runtime.get(storeModuleId(id)));
  if (desired.enabled) return live ? "active" : "pending";
  return live ? "pending" : "disabled";
}

/**
 * Whether the running frontend serves what the module now asks for: its
 * layers once it runs, none of them once the store took it down.
 */
function resolveFrontend(sources: EntrySources): StoreFrontendState {
  const { id } = sources.catalogEntry;
  const module = sources.runtime.get(storeModuleId(id));
  const live = isLive(module) && module !== undefined;
  const layers = live
    ? frontendModuleNamesUnder(module.localPath)
    : removedLayerNames(id);
  if (layers.length === 0) return "none";
  const served = sources.acknowledgement?.modules;
  if (!served) return "unknown";
  const isSynced = live
    ? layers.every((name) => served.has(name))
    : layers.every((name) => !served.has(name));
  return isSynced ? "synced" : "pending";
}

function isNewer(latest: string | undefined, installed: string | undefined) {
  if (!latest || !installed || !valid(latest) || !valid(installed)) {
    return false;
  }
  return gt(latest, installed);
}

function buildEntry(sources: EntrySources): StoreListingEntry {
  const { catalogEntry, release } = sources;
  const { id } = catalogEntry;
  const installedVersion = sources.state.modules[id]?.version;
  const compatible =
    !release || isCompatible(release, sources.interfaceVersion);
  const operation = currentOperation();
  return {
    ...catalogEntry,
    title: `${CATALOG_I18N_PREFIX}.${id}.title`,
    description: `${CATALOG_I18N_PREFIX}.${id}.description`,
    state: resolveState(sources),
    installedVersion,
    latestVersion: release?.version,
    updateAvailable: isNewer(release?.version, installedVersion),
    compatible,
    requiredInterfaceRange: compatible ? undefined : release?.interfaceRange,
    error: storeError(id),
    operation: operation?.moduleId === id ? { ...operation } : undefined,
    frontend: resolveFrontend(sources),
  };
}

async function readStateSafely(projectPath: string): Promise<DesiredStateRead> {
  try {
    return { state: await readDesiredState(projectPath) };
  } catch (error) {
    return {
      state: { modules: {} },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The store listing: every catalog module with what the desired-state file,
 * the runtime, the registry and the frontend say about it.
 */
export async function buildStoreListing(): Promise<StoreListing> {
  const { projectPath, dev } = await GetRuntimeInfo();
  const [catalog, stateRead, runtime] = await Promise.all([
    loadStoreCatalog(),
    readStateSafely(projectPath),
    listRuntimeModules(),
  ]);
  const releases = await Promise.all(
    catalog.map((entry) => latestRelease(entry.package, projectPath)),
  );
  const interfaceVersion = installedInterfaceVersion();
  const acknowledgement = getFrontendAcknowledgement();
  return {
    enabled: isStoreEditable(dev),
    modules: catalog.map((catalogEntry, index) =>
      buildEntry({
        catalogEntry,
        state: stateRead.state,
        runtime,
        release: releases[index],
        interfaceVersion,
        acknowledgement,
      }),
    ),
    busy: currentOperation() !== undefined,
    interfaceVersion,
    dev,
    stateFile: stateFileName(),
    stateError: stateRead.error,
  };
}
