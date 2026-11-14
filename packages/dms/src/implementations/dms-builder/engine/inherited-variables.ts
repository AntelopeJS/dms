import { parseEnv } from "node:util";

let inheritedVariables = new Set<string>();

/**
 * Records the variables the project started with that its `.env` did not supply, such as one
 * exported in the shell that started it. Core and the configuration's own loaders never overwrite
 * a variable already set, so a value the builder writes to `.env` for one of them never loads.
 * Called once the project has loaded its `.env`, at each start.
 *
 * @param envText What the project's `.env` held when it was loaded, read as core reads it.
 */
export function recordInheritedVariables(envText: string | undefined): void {
  const loaded = new Map(
    Object.entries(envText === undefined ? {} : parseEnv(envText)),
  );
  inheritedVariables = new Set(
    Object.entries(process.env)
      .filter(([name, value]) => loaded.get(name) !== value)
      .map(([name]) => name),
  );
}

/** Why `.env` cannot give `name` the value `value`: the project keeps the one it started with. */
export function shadowing(name: string, value: string): string | undefined {
  if (!inheritedVariables.has(name) || process.env[name] === value) {
    return undefined;
  }
  return `the project runs with a value of ${name} it did not load from .env, for example one set in the environment that started it (its shell), which wins over .env: unset ${name} there and restart the project, or it never loads the new value`;
}
