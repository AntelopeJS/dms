import { readFile } from "node:fs/promises";
import path from "node:path";
import { createLookupCache } from "./cache";
import { npmView } from "./registry";
import type {
  InterfaceImplementation,
  MissingInterface,
  ModuleDependents,
  PackageRelease,
  RuntimeModule,
} from "./types";

/**
 * The registry `ajs project modules install` reads to find the modules that
 * implement an interface: a root manifest maps each interface package to a
 * folder, whose own manifest lists its implementations.
 */
const INTERFACES_REGISTRY_URL =
  "https://raw.githubusercontent.com/AntelopeJS/interfaces/main";
const MANIFEST_FILE = "manifest.json";
/** The core implements this one itself: no module ever lists it. */
const CORE_INTERFACE = "@antelopejs/interface-core";
const PACKAGE_SOURCE_TYPE = "package";
const PACKAGE_JSON = "package.json";
const FETCH_TIMEOUT_MS = 10_000;
const HOUR_MS = 60 * 60 * 1000;
const FAILED_LOOKUP_MS = 5 * 60 * 1000;
const LIFETIMES = { found: HOUR_MS, failed: FAILED_LOOKUP_MS };
/** Interface packages carry `interface-` in their name by convention. */
const INTERFACE_NAME_PATTERN = /(^|\/)interface-/;

interface RegistryManifest {
  interfaces?: Record<string, string>;
}

interface RegistrySource {
  type?: string;
  package?: string;
}

interface RegistryModule {
  name?: string;
  source?: RegistrySource;
}

interface InterfaceManifest {
  modules?: RegistryModule[];
}

interface AntelopeManifest {
  implements?: unknown;
  standalone?: unknown;
}

interface ModulePackage {
  name?: string;
  dependencies?: Record<string, string>;
  antelopeJs?: AntelopeManifest;
}

const registryDocuments = createLookupCache<unknown>(LIFETIMES);
const interfaceKinds = createLookupCache<InterfaceKind>(LIFETIMES);

/**
 * How the core treats an unresolved dependency: `required` blocks loading,
 * `standalone` runs without an implementation, `library` is no interface.
 */
type InterfaceKind = "required" | "standalone" | "library";

function fetchRegistryDocument(file: string): ReturnType<Response["json"]> {
  return registryDocuments.get(file, async () => {
    const response = await fetch(`${INTERFACES_REGISTRY_URL}/${file}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return undefined;
    const document: unknown = await response.json();
    return document;
  });
}

async function registryFolders(): Promise<Record<string, string>> {
  const manifest: RegistryManifest | undefined =
    await fetchRegistryDocument(MANIFEST_FILE);
  return manifest?.interfaces ?? {};
}

function asImplementation(
  module: RegistryModule,
): InterfaceImplementation | undefined {
  const { name, source } = module;
  if (source?.type !== PACKAGE_SOURCE_TYPE || !source.package) return undefined;
  return { name: name ?? source.package, package: source.package };
}

/**
 * Modules the interfaces registry lists for `interfacePackage`, npm packages
 * only: the store never installs from git or a local folder.
 */
export async function findImplementations(
  interfacePackage: string,
): Promise<InterfaceImplementation[]> {
  const folder = (await registryFolders())[interfacePackage];
  if (!folder) return [];
  const manifest: InterfaceManifest | undefined = await fetchRegistryDocument(
    `interfaces/${folder}/${MANIFEST_FILE}`,
  );
  return (manifest?.modules ?? []).flatMap((module) => {
    const implementation = asImplementation(module);
    return implementation ? [implementation] : [];
  });
}

function kindOf(
  packageName: string,
  antelopeJs: AntelopeManifest,
): InterfaceKind {
  const implemented = Array.isArray(antelopeJs.implements)
    ? antelopeJs.implements
    : [];
  const isModule = implemented.some((name) => name !== packageName);
  if (isModule) return "library";
  return antelopeJs.standalone === true ? "standalone" : "required";
}

/**
 * `npm view` answers a range matching several releases with one manifest per
 * release, oldest first: the newest is the one that installs.
 */
function newestManifest(
  view: Awaited<ReturnType<typeof npmView>>,
): AntelopeManifest | undefined {
  const manifest = Array.isArray(view) ? view.at(-1) : view;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the existing object-only npm metadata filter.
  return manifest && typeof manifest === "object" ? manifest : undefined;
}

/**
 * Tells an interface package from a plain library as the core does: by its
 * `antelopeJs` manifest key, read from the registry. Only packages that look
 * like interfaces are looked up.
 */
async function interfaceKind(
  dependency: string,
  range: string,
  projectPath: string,
): Promise<InterfaceKind> {
  const looksLikeInterface =
    INTERFACE_NAME_PATTERN.test(dependency) ||
    dependency in (await registryFolders());
  if (!looksLikeInterface) return "library";
  const kind = await interfaceKinds.get(`${dependency}@${range}`, async () => {
    const antelopeJs = newestManifest(
      await npmView(`${dependency}@${range}`, ["antelopeJs"], projectPath),
    );
    return antelopeJs ? kindOf(dependency, antelopeJs) : "library";
  });
  return kind ?? "library";
}

async function readModulePackage(
  localPath: string,
): Promise<ModulePackage | undefined> {
  try {
    return JSON.parse(
      await readFile(path.join(localPath, PACKAGE_JSON), "utf-8"),
    );
  } catch {
    return undefined;
  }
}

/** The interfaces a module's package.json says it implements. */
export async function implementedBy(localPath: string): Promise<string[]> {
  const implemented = (await readModulePackage(localPath))?.antelopeJs
    ?.implements;
  return Array.isArray(implemented) ? implemented.map(String) : [];
}

/** Every interface a running module implements, the core's own included. */
export async function implementedInterfaces(
  modules: readonly RuntimeModule[],
): Promise<Set<string>> {
  const lists = await Promise.all(
    modules.map((module) => implementedBy(module.localPath)),
  );
  return new Set([CORE_INTERFACE, ...lists.flat()]);
}

/**
 * The interfaces `release` depends on that neither a running module nor the
 * release itself implements and the core would refuse to load without, each
 * with the registry modules that implement it.
 */
export async function findMissingInterfaces(
  release: PackageRelease,
  implemented: ReadonlySet<string>,
  projectPath: string,
): Promise<MissingInterface[]> {
  const ownInterfaces = new Set(release.implements ?? []);
  const unresolved = Object.entries(release.dependencies ?? {}).filter(
    ([name]) => !implemented.has(name) && !ownInterfaces.has(name),
  );
  const kinds = await Promise.all(
    unresolved.map(([name, range]) => interfaceKind(name, range, projectPath)),
  );
  const missing = unresolved
    .filter((_, index) => kinds[index] === "required")
    .map(([name]) => name);
  return Promise.all(
    missing.map(async (interfacePackage) => ({
      interfacePackage,
      candidates: await findImplementations(interfacePackage).catch(() => []),
    })),
  );
}

/**
 * Whether `module` is the project itself, the module antelope.config.ts
 * loads from the project's own folder: no store action can remove it.
 */
export function isProjectModule(
  module: RuntimeModule,
  projectPath: string,
): boolean {
  return (
    path.relative(path.resolve(projectPath), path.resolve(module.localPath)) ===
    ""
  );
}

/**
 * The running modules that need an interface `module` implements and no
 * other running module does: taking `module` down would leave them waiting.
 * The project is told apart from the modules: they can be removed first,
 * the project only changes in its code.
 */
export async function findDependents(
  module: RuntimeModule,
  running: readonly RuntimeModule[],
  projectPath: string,
): Promise<ModuleDependents> {
  const none: ModuleDependents = { modules: [], usedByProject: false };
  const provided = await implementedBy(module.localPath);
  if (provided.length === 0) return none;
  const others = running.filter((other) => other.id !== module.id);
  const stillImplemented = await implementedInterfaces(others);
  const orphaned = provided.filter((name) => !stillImplemented.has(name));
  if (orphaned.length === 0) return none;
  const packages = await Promise.all(
    others.map((other) => readModulePackage(other.localPath)),
  );
  const dependents = others.filter((_, index) =>
    orphaned.some((name) => packages[index]?.dependencies?.[name]),
  );
  return {
    modules: dependents
      .filter((other) => !isProjectModule(other, projectPath))
      .map((other) => other.packageName ?? other.id),
    usedByProject: dependents.some((other) =>
      isProjectModule(other, projectPath),
    ),
  };
}
