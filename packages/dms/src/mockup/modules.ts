import { bundledCatalog } from "../store";

/** A DMS module a mockup's app needs, as the viewer draws it: its catalog entry. */
export interface MockupModule {
  /** The module's id in the store catalog. */
  id: string;
  /** The npm package building the mockup installs. */
  package: string;
  /** The module's Iconify icon. */
  icon: string;
}

/** The ids of the bundled store catalog, the modules a spec may list. */
export function knownModuleIds(): string[] {
  return bundledCatalog().map((entry) => entry.id);
}

/**
 * The problems of a spec's `modules`: an id the bundled catalog does not
 * list, and an id listed twice, each at its index.
 */
export function moduleIssues(
  modules: readonly string[],
): Array<{ index: number; message: string }> {
  const known = knownModuleIds();
  const seen = new Set<string>();
  return modules.flatMap((id, index) => {
    if (!known.includes(id)) {
      return [
        {
          index,
          message: `no module has the id "${id}": the modules are ${known.join(", ")}`,
        },
      ];
    }
    const duplicate = seen.has(id);
    seen.add(id);
    return duplicate
      ? [{ index, message: `the module "${id}" is already listed` }]
      : [];
  });
}

/** The listed modules as the viewer draws them, in the spec's order; an id the catalog lacks is left out. */
export function compileModules(modules: readonly string[]): MockupModule[] {
  const entries = bundledCatalog();
  return modules.flatMap((id) => {
    const entry = entries.find((candidate) => candidate.id === id);
    return entry
      ? [{ id: entry.id, package: entry.package, icon: entry.icon }]
      : [];
  });
}
