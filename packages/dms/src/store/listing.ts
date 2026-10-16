import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { satisfies, valid, validRange } from "semver";
import { isStoreEditable } from "../config";
import { frontendModuleNamesUnder } from "../implementations/dms/frontend-modules";
import {
  type FrontendAcknowledgement,
  getFrontendAcknowledgement,
} from "../implementations/dms/frontend-ready";
import { loadStoreCatalog } from "./catalog";
import { installedInterfaceVersion, isCompatible } from "./compatibility";
import { listCatalogDeclarations } from "./declarations";
import { currentOperation, removedLayerNames, storeError } from "./operations";
import { latestRelease } from "./registry";
import { isLive, listRuntimeModules } from "./runtime";
import type {
  PackageRelease,
  RuntimeModule,
  StoreCatalogEntry,
  StoreDeclaration,
  StoreFrontendState,
  StoreListing,
  StoreListingEntry,
  StoreModuleState,
} from "./types";

const CATALOG_I18N_PREFIX = "$modules.store.catalog";

/** What one listing entry is computed from. */
interface EntrySources {
  catalogEntry: StoreCatalogEntry;
  declaration: StoreDeclaration | undefined;
  runtime: ReadonlyMap<string, RuntimeModule>;
  release: PackageRelease | undefined;
  interfaceVersion: string;
  acknowledgement: FrontendAcknowledgement | undefined;
}

interface DeclarationsRead {
  declarations: Map<string, StoreDeclaration>;
  error?: string;
}

function runtimeModule(sources: EntrySources): RuntimeModule | undefined {
  const key = sources.declaration?.key;
  return key === undefined ? undefined : sources.runtime.get(key);
}

function resolveState(sources: EntrySources): StoreModuleState {
  const { id } = sources.catalogEntry;
  if (currentOperation()?.moduleId === id) return "busy";
  if (storeError(id)) return "error";
  const { declaration } = sources;
  if (!declaration) return "available";
  const live = isLive(runtimeModule(sources));
  if (!declaration.disabled) return live ? "active" : "pending";
  return live ? "pending" : "disabled";
}

/**
 * Whether the running frontend serves what the module now asks for: its
 * layers once it runs, none of them once the store took it down.
 */
function resolveFrontend(sources: EntrySources): StoreFrontendState {
  const { id } = sources.catalogEntry;
  const module = runtimeModule(sources);
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

/**
 * Whether the latest release falls outside the declared range: within it,
 * the next start picks it up by itself; outside, the range has to move.
 */
function isRangeBehind(
  latest: string | undefined,
  range: string | undefined,
): boolean {
  if (!latest || !range || !valid(latest)) return false;
  const declared = validRange(range);
  return declared !== null && !satisfies(latest, declared);
}

function buildEntry(sources: EntrySources): StoreListingEntry {
  const { catalogEntry, release, declaration } = sources;
  const { id } = catalogEntry;
  const compatible =
    !release || isCompatible(release, sources.interfaceVersion);
  const operation = currentOperation();
  return {
    ...catalogEntry,
    title: `${CATALOG_I18N_PREFIX}.${id}.title`,
    description: `${CATALOG_I18N_PREFIX}.${id}.description`,
    state: resolveState(sources),
    installedVersion: runtimeModule(sources)?.version ?? declaration?.range,
    declaredRange: declaration?.range,
    latestVersion: release?.version,
    updateAvailable: isRangeBehind(release?.version, declaration?.range),
    compatible,
    requiredInterfaceRange: compatible ? undefined : release?.interfaceRange,
    error: storeError(id),
    operation: operation?.moduleId === id ? { ...operation } : undefined,
    frontend: resolveFrontend(sources),
  };
}

async function readDeclarationsSafely(
  catalog: readonly StoreCatalogEntry[],
): Promise<DeclarationsRead> {
  try {
    return { declarations: await listCatalogDeclarations(catalog) };
  } catch (error) {
    return {
      declarations: new Map(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The store listing: every catalog module with what antelope.config.ts, the
 * runtime, the registry and the frontend say about it.
 */
export async function buildStoreListing(): Promise<StoreListing> {
  const { projectPath, dev } = await GetRuntimeInfo();
  const catalog = await loadStoreCatalog();
  const [read, runtime, releases] = await Promise.all([
    readDeclarationsSafely(catalog),
    listRuntimeModules(),
    Promise.all(
      catalog.map((entry) => latestRelease(entry.package, projectPath)),
    ),
  ]);
  const interfaceVersion = installedInterfaceVersion();
  const acknowledgement = getFrontendAcknowledgement();
  return {
    enabled: isStoreEditable(dev) && !read.error,
    modules: catalog.map((catalogEntry, index) =>
      buildEntry({
        catalogEntry,
        declaration: read.declarations.get(catalogEntry.id),
        runtime,
        release: releases[index],
        interfaceVersion,
        acknowledgement,
      }),
    ),
    busy: currentOperation() !== undefined,
    interfaceVersion,
    dev,
    configError: read.error,
  };
}
