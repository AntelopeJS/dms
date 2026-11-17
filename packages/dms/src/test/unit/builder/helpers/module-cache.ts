import type { ControllerClass } from "@antelopejs/interface-api";

/** Makes the running process answer `exports` as the module loaded from `file`, as the app would have loaded it. */
export function provideLoadedModule(
  file: string,
  exports: Record<string, ControllerClass>,
): void {
  Object.assign(require.cache, { [file]: { exports } });
}

/** Drops the module a spec provided. */
export function forgetLoadedModule(file: string): void {
  delete require.cache[file];
}
