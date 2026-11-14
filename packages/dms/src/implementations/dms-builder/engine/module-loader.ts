import { createRequire } from "node:module";
import { isIndexable } from "./guards";

/**
 * The exports of a module, as this process resolves `specifier`; none when it exports no object.
 *
 * This file is the only place the engine loads a module by a specifier that is not a literal: the
 * block catalog, the DataTypes and the catalog providers name theirs as data, and the project's
 * own files resolve packages from where they sit.
 */
export function loadModule(specifier: string) {
  const loaded: unknown = require(specifier);
  return isIndexable(loaded) ? loaded : {};
}

/** A `require` that resolves from the folder of `file` the way a module written there resolves it. */
export function requireFrom(file: string): NodeJS.Require {
  return createRequire(file);
}

/** The exports of `specifier`, resolved from the folder of `file` the way a module written there resolves it. */
export function loadModuleFrom(file: string, specifier: string) {
  const loaded: unknown = requireFrom(file)(specifier);
  return isIndexable(loaded) ? loaded : {};
}

/** The file `specifier` resolves to from this process. */
export function resolveModule(specifier: string): string {
  return require.resolve(specifier);
}

/** Every module this process has loaded, by file, with what it exports. */
export function loadedModules() {
  return Object.entries(require.cache).map(([file, entry]) => {
    const exported: unknown = entry?.exports;
    return [file, isIndexable(exported) ? exported : {}] as const;
  });
}
