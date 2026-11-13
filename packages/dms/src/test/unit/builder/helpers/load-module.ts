import { readFileSync } from "node:fs";
import Module from "node:module";
import type { z } from "zod";

type Compilable = Module & { _compile: (source: string, file: string) => void };

function isCompilable(value: Module): value is Compilable {
  return "_compile" in value && typeof value._compile === "function";
}

/**
 * Compiles a built module afresh, answering the requires named in `mocks` with
 * the given exports and every other require as the module would resolve it.
 * The compiled exports are handed back only once `exposes` has checked that
 * they hold what the caller uses.
 */
export function loadModule<Mock, Exports>(
  filename: string,
  mocks: ReadonlyMap<string, Mock>,
  exposes: z.ZodType<Exports, z.ZodTypeDef, Exports>,
): Exports {
  const load = Module.createRequire(filename);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = load.resolve.paths("x") ?? [];
  compiled.require = (name: string): ReturnType<NodeJS.Module["require"]> =>
    mocks.has(name) ? mocks.get(name) : load(name);
  if (!isCompilable(compiled)) {
    throw new Error("Node's module loader has no _compile to call");
  }
  compiled._compile(readFileSync(filename, "utf8"), filename);
  const parsed = exposes.safeParse(compiled.exports);
  if (!parsed.success) {
    throw new Error(`${filename} does not export what the test uses`);
  }
  return parsed.data;
}
