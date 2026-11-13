import path from "node:path";
import { Events, GetModuleInfo } from "@antelopejs/interface-core";
import type { FileChange, OpWarning } from "@antelopejs/interface-dms-builder";

const RELOAD_TIMEOUT_MS = 60_000;
const MS_PER_SECOND = 1000;
const ACTIVE = "active";
const UNKNOWN = "unknown";

/** A watch on one module's next reload, set before its files are written. */
export interface ModuleReload {
  /**
   * Waits until the module has been unloaded and started again, or the wait runs out, and answers
   * the warning to attach when it is not loaded afterwards.
   */
  loaded(): Promise<OpWarning | undefined>;
  /** Stops watching, for a write that did not happen or changed nothing in the module. */
  cancel(): void;
}

type ReloadWatcher = (module: string) => ModuleReload;

type LifecycleHandler = (module: string) => void;

/** One of the runtime's module lifecycle events, as far as a watcher subscribes to it. */
interface LifecycleEvent {
  register(handler: LifecycleHandler): void;
  unregister(handler: LifecycleHandler): void;
}

/** What the watcher reads of the runtime: two lifecycle events and a module's status. */
export interface ReloadRuntime {
  destroyed: LifecycleEvent;
  started: LifecycleEvent;
  status(module: string): Promise<string>;
}

function notLoaded(module: string, reason: string): OpWarning {
  return {
    code: "module_not_loaded",
    message: `The mapping was written, but module "${module}" did not load again: ${reason}. The backend log has its error.`,
  };
}

async function statusOf(module: string): Promise<string> {
  try {
    return (await GetModuleInfo(module)).status;
  } catch {
    return UNKNOWN;
  }
}

const CORE_RUNTIME: ReloadRuntime = {
  destroyed: Events.ModuleDestroyed,
  started: Events.ModuleStarted,
  status: statusOf,
};

/**
 * Watches `module` through the runtime's lifecycle events: a reload is its destruction followed by
 * its start. The wait starts when {@link ModuleReload.loaded} is called, after the write.
 */
export function watchModuleReload(
  module: string,
  runtime: ReloadRuntime = CORE_RUNTIME,
  timeoutMs: number = RELOAD_TIMEOUT_MS,
): ModuleReload {
  let destroyed = false;
  let finish: (started: boolean) => void = () => undefined;
  const settled = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const onDestroyed = (id: string) => {
    if (id === module) destroyed = true;
  };
  const onStarted = (id: string) => {
    if (id === module && destroyed) finish(true);
  };
  let timer: NodeJS.Timeout | undefined;
  const stop = () => {
    clearTimeout(timer);
    runtime.destroyed.unregister(onDestroyed);
    runtime.started.unregister(onStarted);
    finish(false);
  };
  runtime.destroyed.register(onDestroyed);
  runtime.started.register(onStarted);
  return {
    cancel: stop,
    async loaded() {
      timer = setTimeout(() => finish(false), timeoutMs);
      const started = await settled;
      stop();
      if (destroyed && !started) {
        return notLoaded(
          module,
          `it was unloaded and did not start again within ${timeoutMs / MS_PER_SECOND} s`,
        );
      }
      const status = await runtime.status(module);
      return status === ACTIVE
        ? undefined
        : notLoaded(module, `the runtime reports it ${status}`);
    },
  };
}

const watchThroughCore: ReloadWatcher = (module) => watchModuleReload(module);

let watcher: ReloadWatcher = watchThroughCore;

/** Starts watching `module`'s next reload, through the watcher a spec may have put in place. */
export function watchReloadOf(module: string): ModuleReload {
  return watcher(module);
}

/** Replaces the reload watcher in specs that run without the runtime; `undefined` restores it. */
export function setModuleReloadForTests(next?: ReloadWatcher): void {
  watcher = next ?? watchThroughCore;
}

/** Whether any of `changes` is a file under the module rooted at `root`. */
export function changesModule(changes: FileChange[], root: string): boolean {
  return changes.some((change) => {
    const relative = path.relative(root, change.path);
    return (
      relative !== "" &&
      !relative.startsWith("..") &&
      !path.isAbsolute(relative)
    );
  });
}
