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
import {
  frontendRequirement,
  releaseFrontendRange,
  type RunningFrontend,
  runningFrontend,
} from "./frontend-compatibility";
import {
  findDependents,
  findMissingInterfaces,
  implementedInterfaces,
} from "./interfaces";
import { currentOperation, removedLayerNames, storeError } from "./operations";
import { latestRelease } from "./registry";
import { findWorkingCopy, isLive, listRuntimeModules } from "./runtime";
import type {
  PackageRelease,
  RuntimeModule,
  FrontendRequirement,
  MissingInterface,
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
  /** The developer's working copy that runs it, when nothing declares it from npm. */
  workingCopy: RuntimeModule | undefined;
  runtime: ReadonlyMap<string, RuntimeModule>;
  release: PackageRelease | undefined;
  interfaceVersion: string;
  acknowledgement: FrontendAcknowledgement | undefined;
}

/** What the listing knows of the platform as a whole. */
interface PlatformState {
  projectPath: string;
  live: RuntimeModule[];
  implemented: ReadonlySet<string>;
  frontend: RunningFrontend | undefined;
}

/** What an entry needs before it can be installed, updated or taken down. */
interface EntryRequirements {
  frontendRange?: string;
  frontendRequirement?: FrontendRequirement;
  missingInterfaces: MissingInterface[];
  dependents: string[];
  usedByProject: boolean;
}

interface DeclarationsRead {
  declarations: Map<string, StoreDeclaration>;
  error?: string;
}

function runtimeModule(sources: EntrySources): RuntimeModule | undefined {
  const key = sources.declaration?.key;
  return key === undefined ? sources.workingCopy : sources.runtime.get(key);
}

function resolveState(sources: EntrySources): StoreModuleState {
  const { id } = sources.catalogEntry;
  if (currentOperation()?.moduleId === id) return "busy";
  if (storeError(id)) return "error";
  const { declaration } = sources;
  if (!declaration) return sources.workingCopy ? "active" : "available";
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

/**
 * The release the next install or update would load: the latest one, when
 * the module is not declared or its range has fallen behind.
 */
function pendingRelease(sources: EntrySources): PackageRelease | undefined {
  const { release, declaration } = sources;
  if (!release || sources.workingCopy) return undefined;
  if (!declaration) return release;
  return isRangeBehind(release.version, declaration.range)
    ? release
    : undefined;
}

async function checkFrontend(
  sources: EntrySources,
  release: PackageRelease,
  platform: PlatformState,
): Promise<Pick<EntryRequirements, "frontendRange" | "frontendRequirement">> {
  const range = await releaseFrontendRange(
    sources.catalogEntry.package,
    release.version,
    platform.projectPath,
  );
  if (!range) return {};
  const requirement = platform.frontend
    ? await frontendRequirement({
        range,
        running: platform.frontend.version,
        projectPath: platform.projectPath,
        replacedFolder: runtimeModule(sources)?.localPath,
      })
    : undefined;
  return { frontendRange: range, frontendRequirement: requirement };
}

/**
 * What keeps a declared module that does not run from starting: the core
 * refuses it while an interface it needs has no implementation.
 */
async function stalledOn(
  sources: EntrySources,
  platform: PlatformState,
): Promise<MissingInterface[]> {
  const { declaration, release } = sources;
  if (!declaration || declaration.disabled || !release) return [];
  if (isLive(runtimeModule(sources))) return [];
  return findMissingInterfaces(
    release,
    platform.implemented,
    platform.projectPath,
  );
}

async function inspectRequirements(
  sources: EntrySources,
  platform: PlatformState,
): Promise<EntryRequirements> {
  const module = runtimeModule(sources);
  const { modules: dependents, usedByProject } =
    module && isLive(module)
      ? await findDependents(module, platform.live, platform.projectPath)
      : { modules: [], usedByProject: false };
  const release = pendingRelease(sources);
  if (!release) {
    return {
      missingInterfaces: await stalledOn(sources, platform),
      dependents,
      usedByProject,
    };
  }
  const [frontend, missingInterfaces] = await Promise.all([
    checkFrontend(sources, release, platform),
    findMissingInterfaces(release, platform.implemented, platform.projectPath),
  ]);
  return { ...frontend, missingInterfaces, dependents, usedByProject };
}

function buildEntry(
  sources: EntrySources,
  requirements: EntryRequirements,
): StoreListingEntry {
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
    isWorkingCopy: sources.workingCopy ? true : undefined,
    declaredRange: declaration?.range,
    latestVersion: release?.version,
    updateAvailable: isRangeBehind(release?.version, declaration?.range),
    compatible,
    requiredInterfaceRange: compatible ? undefined : release?.interfaceRange,
    error: storeError(id),
    operation: operation?.moduleId === id ? { ...operation } : undefined,
    frontend: resolveFrontend(sources),
    ...requirements,
  };
}

async function readPlatformState(
  projectPath: string,
  runtime: ReadonlyMap<string, RuntimeModule>,
): Promise<PlatformState> {
  const live = [...runtime.values()].filter((module) => isLive(module));
  return {
    projectPath,
    live,
    implemented: await implementedInterfaces(live),
    frontend: runningFrontend(projectPath),
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
  const platform = await readPlatformState(projectPath, runtime);
  const sources = catalog.map((catalogEntry, index) => {
    const declaration = read.declarations.get(catalogEntry.id);
    return {
      catalogEntry,
      declaration,
      workingCopy: declaration
        ? undefined
        : findWorkingCopy(catalogEntry.package, runtime.values()),
      runtime,
      release: releases[index],
      interfaceVersion,
      acknowledgement,
    };
  });
  const requirements = await Promise.all(
    sources.map((entry) => inspectRequirements(entry, platform)),
  );
  return {
    enabled: isStoreEditable(dev) && !read.error,
    modules: sources.map((entry, index) =>
      buildEntry(entry, requirements[index]),
    ),
    busy: currentOperation() !== undefined,
    interfaceVersion,
    dev,
    configError: read.error,
    frontendVersion: platform.frontend?.version,
    frontendVersionSource: platform.frontend?.source,
  };
}
