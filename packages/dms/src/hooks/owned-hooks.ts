import {
  type Hook,
  type HookHandler,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";

/** Hooks registered together, and released together. */
export interface OwnedHooks {
  /** `RegisterHook`, remembered so that `release()` undoes it. */
  register<H extends Hook>(name: H, callback: HookHandler<H>): void;
  /** Unregisters every hook registered through this scope. */
  release(): void;
}

export function createOwnedHooks(): OwnedHooks {
  const releases: Array<() => void> = [];
  return {
    register(name, callback) {
      RegisterHook(name, callback);
      releases.push(() => UnregisterHook(name, callback));
    },
    release() {
      for (const unregister of releases.splice(0)) unregister();
    },
  };
}

/**
 * The hooks this module generation registers, released by `destroy()`. The
 * hook registry lives in the shared interface package and outlives the
 * generation: a handler left behind a hot reload belongs to a context that no
 * longer exists, and the next `ExecuteHooks` threw
 * `ModuleContextInvalidatedError` — the new generation's own `start()` did.
 */
export const dmsHooks = createOwnedHooks();
