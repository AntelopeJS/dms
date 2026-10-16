import type { ModuleSourcePackage } from "@antelopejs/interface-core/config";
import * as coreModules from "@antelopejs/interface-core/modules";
import type { StoreCatalogEntry, StoreDeclaration } from "./types";

const PACKAGE_SOURCE_TYPE = "package" as const;
/**
 * A core that predates the declaration functions never answers them: the
 * store then stays read-only instead of waiting forever.
 */
const DECLARATIONS_TIMEOUT_MS = 5000;

/**
 * The module declaration functions of `@antelopejs/interface-core/modules`,
 * looked up at call time: an interface-core release that predates them has
 * no such export, and the store then stays read-only rather than failing to
 * load. Mirrors their declarations there.
 */
interface ModuleDeclaration {
  source?: unknown;
  config?: unknown;
  disabled?: boolean;
  optional?: boolean;
}

type ModuleDeclarationChanges = Partial<ModuleDeclaration>;

interface DeclarationFunctions {
  ListModuleDeclarations: () => Promise<Record<string, ModuleDeclaration>>;
  SaveModuleDeclaration: (
    module: string,
    changes: ModuleDeclarationChanges,
  ) => Promise<void>;
  RemoveModuleDeclaration: (module: string) => Promise<void>;
}

const DECLARATION_FUNCTIONS: ReadonlyArray<keyof DeclarationFunctions> = [
  "ListModuleDeclarations",
  "SaveModuleDeclaration",
  "RemoveModuleDeclaration",
];

interface PackageSource {
  type: string;
  package?: string;
  version?: string;
}

/** The core does not implement the module declaration functions. */
export class DeclarationsUnavailableError extends Error {
  constructor() {
    super(
      "This @antelopejs/core cannot edit antelope.config.ts: update it to one that implements the module declaration functions",
    );
  }
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

function declarationFunctions(): DeclarationFunctions {
  const exported: Record<string, unknown> = { ...coreModules };
  const functions = DECLARATION_FUNCTIONS.map((name) => exported[name]);
  if (!functions.every(isFunction)) {
    throw new DeclarationsUnavailableError();
  }
  const [list, save, remove] = functions;
  return {
    ListModuleDeclarations:
      list as DeclarationFunctions["ListModuleDeclarations"],
    SaveModuleDeclaration:
      save as DeclarationFunctions["SaveModuleDeclaration"],
    RemoveModuleDeclaration:
      remove as DeclarationFunctions["RemoveModuleDeclaration"],
  };
}

function withTimeout<T>(call: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DeclarationsUnavailableError()),
      DECLARATIONS_TIMEOUT_MS,
    );
    timer.unref();
  });
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

function packageSource(
  declaration: ModuleDeclaration,
): PackageSource | undefined {
  const source = declaration.source as PackageSource | undefined;
  return source?.type === PACKAGE_SOURCE_TYPE ? source : undefined;
}

/**
 * The entries of antelope.config.ts that install a catalog module from npm,
 * by catalog id. An entry from a local folder or git is the developer's
 * working copy: the store leaves it out.
 */
export async function listCatalogDeclarations(
  catalog: readonly StoreCatalogEntry[],
): Promise<Map<string, StoreDeclaration>> {
  const declarations = await withTimeout(
    declarationFunctions().ListModuleDeclarations(),
  );
  const byPackage = new Map(catalog.map((entry) => [entry.package, entry.id]));
  const result = new Map<string, StoreDeclaration>();
  for (const [key, declaration] of Object.entries(declarations)) {
    const source = packageSource(declaration);
    const id = source?.package ? byPackage.get(source.package) : undefined;
    if (!id || !source?.package || result.has(id)) continue;
    result.set(id, {
      key,
      package: source.package,
      range: source.version ?? "",
      disabled: declaration.disabled === true,
      config: declaration.config,
    });
  }
  return result;
}

export function saveDeclaration(
  key: string,
  changes: ModuleDeclarationChanges,
): Promise<void> {
  return withTimeout(
    declarationFunctions().SaveModuleDeclaration(key, changes),
  );
}

export function removeDeclaration(key: string): Promise<void> {
  return withTimeout(declarationFunctions().RemoveModuleDeclaration(key));
}

/** The source the store writes for `packageName` at version `range`. */
export function packageDeclarationSource(
  packageName: string,
  range: string,
): ModuleSourcePackage {
  return { type: PACKAGE_SOURCE_TYPE, package: packageName, version: range };
}
