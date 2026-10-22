import { assert } from "@antelopejs/interface-api-util";
import {
  hasDeclaration,
  packageDeclarationSource,
  saveDeclaration,
} from "./declarations";
import {
  FRONTEND_PACKAGE,
  releaseFrontendRange,
  runningFrontend,
  supportsFrontend,
} from "./frontend-compatibility";
import {
  findDependents,
  findMissingInterfaces,
  implementedBy,
  implementedInterfaces,
} from "./interfaces";
import { latestRelease } from "./registry";
import {
  describeRuntimeModule,
  isLive,
  listRuntimeModules,
  loadStoreModule,
} from "./runtime";
import type {
  PackageRelease,
  RuntimeModule,
  StoreCatalogEntry,
  StoreDependencyChoice,
} from "./types";

const HTTP_CONFLICT = 409;
/** The store writes a caret range: patches and minors load on their own. */
const RANGE_PREFIX = "^";

/** What checking and installing a module's requirements needs to know. */
export interface RequirementContext {
  catalogEntry: StoreCatalogEntry;
  projectPath: string;
  /** The module's key in antelope.config.ts. */
  key: string;
  /** Modules the owner picked for the interfaces the release misses. */
  dependencies: StoreDependencyChoice[];
  /** Keys of the dependencies the operation loaded, undone on failure. */
  installedDependencies: string[];
}

export function caretRange(release: PackageRelease): string {
  return `${RANGE_PREFIX}${release.version}`;
}

/**
 * Refuses a release whose frontend layer does not support the running
 * dms-frontend: `ajs dms dev` would refuse the whole workspace with it. An
 * unknown range or version lets it through, as dms-frontend does.
 */
export async function assertFrontendSupports(
  context: RequirementContext,
  release: PackageRelease,
): Promise<void> {
  const { package: packageName } = context.catalogEntry;
  const range = await releaseFrontendRange(
    packageName,
    release.version,
    context.projectPath,
  );
  const running = runningFrontend(context.projectPath);
  if (!range || !running || supportsFrontend(range, running.version)) return;
  throw new Error(
    `${packageName}@${release.version} supports ${FRONTEND_PACKAGE} ${range}, this project runs ${running.version}`,
  );
}

export async function runningModules(): Promise<RuntimeModule[]> {
  return [...(await listRuntimeModules()).values()].filter((module) =>
    isLive(module),
  );
}

/**
 * The interfaces `release` needs that no running module implements, each
 * paired with the module the owner picked for it. Throws when one has none.
 */
export async function pickDependencies(
  context: RequirementContext,
  release: PackageRelease,
  label: string,
): Promise<Map<string, StoreDependencyChoice>> {
  const implemented = await implementedInterfaces(await runningModules());
  const missing = await findMissingInterfaces(
    release,
    implemented,
    context.projectPath,
  );
  const picked = new Map<string, StoreDependencyChoice>();
  const unpicked: string[] = [];
  for (const { interfacePackage } of missing) {
    const choice = context.dependencies.find(
      (dependency) => dependency.interfacePackage === interfacePackage,
    );
    if (choice) picked.set(interfacePackage, choice);
    else unpicked.push(interfacePackage);
  }
  if (unpicked.length > 0) {
    throw new Error(
      `${label} needs ${unpicked.join(", ")}, which no running module implements`,
    );
  }
  return picked;
}

/**
 * Loads `choice` and writes it to antelope.config.ts, as a plain npm entry
 * under its package name, once it runs and implements the interface.
 */
export async function installDependency(
  context: RequirementContext,
  interfacePackage: string,
  choice: StoreDependencyChoice,
): Promise<void> {
  const key = choice.package;
  if (await hasDeclaration(key)) {
    throw new Error(
      `${key} is already in antelope.config.ts but does not run: start it from there`,
    );
  }
  const release = await latestRelease(key, context.projectPath, true);
  if (!release) {
    throw new Error(`The npm registry has no release of ${key}`);
  }
  const range = caretRange(release);
  context.installedDependencies.push(key);
  await loadStoreModule(key, { package: key, range, config: choice.config });
  await assertImplements(key, interfacePackage);
  await saveDeclaration(key, {
    source: packageDeclarationSource(key, range),
    config: choice.config ?? {},
    optional: true,
  });
}

async function assertImplements(
  key: string,
  interfacePackage: string,
): Promise<void> {
  const module = await describeRuntimeModule(key);
  const implemented = module ? await implementedBy(module.localPath) : [];
  if (!implemented.includes(interfacePackage)) {
    throw new Error(`${key} does not implement ${interfacePackage}`);
  }
}

/**
 * Refuses to take down a module other running modules or the project need:
 * they would wait forever on its interface, and the next start would refuse
 * them. The listing reads the same `findDependents`, so a tile never offers
 * what this refuses.
 */
export async function assertNoDependents(
  context: RequirementContext,
): Promise<void> {
  const module = await describeRuntimeModule(context.key);
  if (!module || !isLive(module)) return;
  const dependents = await findDependents(
    module,
    await runningModules(),
    context.projectPath,
  );
  assert(
    !dependents.usedByProject,
    HTTP_CONFLICT,
    "error.store_module_used_by_project",
  );
  assert(
    dependents.modules.length === 0,
    HTTP_CONFLICT,
    "error.store_module_required",
  );
}
