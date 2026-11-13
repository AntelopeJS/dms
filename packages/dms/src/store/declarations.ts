import type { ModuleSourcePackage } from "@antelopejs/interface-core/config";
import {
  ListModuleDeclarations,
  RemoveModuleDeclaration,
  SaveModuleDeclaration,
} from "@antelopejs/interface-core/modules";
import type {
  ModuleDeclaration,
  ModuleDeclarationChanges,
} from "@antelopejs/interface-core/modules";
import type { StoreCatalogEntry, StoreDeclaration } from "./types";

const PACKAGE_SOURCE_TYPE = "package" as const;

interface PackageSource {
  type: string;
  package?: string;
  version?: string;
}

function packageSource(
  declaration: ModuleDeclaration,
): PackageSource | undefined {
  const { source } = declaration;
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
  const declarations = await ListModuleDeclarations();
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

/** Whether antelope.config.ts has an entry under `key`, whatever its source. */
export async function hasDeclaration(key: string): Promise<boolean> {
  const declarations = await ListModuleDeclarations();
  return Object.hasOwn(declarations, key);
}

export function saveDeclaration(
  key: string,
  changes: ModuleDeclarationChanges,
): Promise<void> {
  return SaveModuleDeclaration(key, changes);
}

export function removeDeclaration(key: string): Promise<void> {
  return RemoveModuleDeclaration(key);
}

/** The source the store writes for `packageName` at version `range`. */
export function packageDeclarationSource(
  packageName: string,
  range: string,
): ModuleSourcePackage {
  return { type: PACKAGE_SOURCE_TYPE, package: packageName, version: range };
}
