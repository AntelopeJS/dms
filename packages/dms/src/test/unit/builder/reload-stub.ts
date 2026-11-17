import type { ModuleReload } from "../../../implementations/dms-builder/engine";

/** A runtime that reloads a written module at once, for specs that run without one. */
export function reloadedAtOnce(): ModuleReload {
  return { loaded: async () => undefined, cancel: () => undefined };
}
