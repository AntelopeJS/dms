import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { getStoreConfig } from "../config";
import { removeFrontendModulesUnder } from "../implementations/dms/frontend-modules";
import { setStoreOperationRunning } from "./activity";
import { findCatalogEntry } from "./catalog";
import { readDesiredState, writeDesiredState } from "./desired-state";
import { isCompatible, installedInterfaceVersion } from "./compatibility";
import { INTERFACE_PACKAGE, latestRelease } from "./registry";
import {
  isDeclaredByConfig,
  isLive,
  listRuntimeModules,
  loadStoreModule,
  storeModuleId,
  unloadStoreModule,
} from "./runtime";
import type {
  DesiredModule,
  DesiredState,
  RuntimeModule,
  StoreCatalogEntry,
  StoreOperation,
  StoreOperationKind,
  StoreOperationStep,
} from "./types";

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** Everything an operation needs, gathered before it runs. */
interface OperationContext {
  id: string;
  catalogEntry: StoreCatalogEntry;
  projectPath: string;
  state: DesiredState;
  /** The file as it was before the operation, written back if it fails. */
  snapshot: DesiredState;
}

type OperationRunner = (context: OperationContext) => Promise<void>;

let current: StoreOperation | undefined;
let queue: Promise<void> = Promise.resolve();
/** Bumped on shutdown: a queued boot reconciliation then stops early. */
let generation = 0;
const errors = new Map<string, string>();
/**
 * Layers of a module the store took down, until the frontend stops serving
 * them: the listing waits on them to say the interface is up to date.
 */
const removedLayers = new Map<string, string[]>();

export function currentOperation(): StoreOperation | undefined {
  return current;
}

export function storeError(id: string): string | undefined {
  return errors.get(id);
}

export function removedLayerNames(id: string): string[] {
  return removedLayers.get(id) ?? [];
}

function setCurrent(operation: StoreOperation | undefined): void {
  current = operation;
  setStoreOperationRunning(operation !== undefined);
}

function setStep(step: StoreOperationStep): void {
  if (current) current.step = step;
}

function cloneState(state: DesiredState): DesiredState {
  return structuredClone(state);
}

function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(describeError).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

async function load(id: string, entry: DesiredModule): Promise<void> {
  setStep("load");
  await loadStoreModule(id, entry);
  removedLayers.delete(id);
}

async function unload(id: string): Promise<void> {
  setStep("unload");
  const runtime = await listRuntimeModules();
  const module = runtime.get(storeModuleId(id));
  if (!isLive(module) || !module) return;
  await unloadStoreModule(id);
  const removed = removeFrontendModulesUnder(module.localPath);
  if (removed.length > 0) removedLayers.set(id, removed);
}

async function save(context: OperationContext): Promise<void> {
  setStep("save");
  await writeDesiredState(context.projectPath, context.state);
}

/**
 * The version an install or an update moves to: the latest release, refused
 * when it needs another `@antelopejs/interface-dms` than the one installed,
 * as the runtime would refuse to load it.
 */
async function resolveTarget(context: OperationContext): Promise<string> {
  setStep("resolve");
  const { package: packageName } = context.catalogEntry;
  const release = await latestRelease(packageName, context.projectPath, true);
  if (!release) {
    throw new Error(
      `The npm registry has no release of ${packageName} this platform can read`,
    );
  }
  const interfaceVersion = installedInterfaceVersion();
  if (!isCompatible(release, interfaceVersion)) {
    throw new Error(
      `${packageName}@${release.version} needs ${INTERFACE_PACKAGE} ${release.interfaceRange}, this platform runs ${interfaceVersion}`,
    );
  }
  if (current) current.targetVersion = release.version;
  return release.version;
}

async function runInstall(context: OperationContext): Promise<void> {
  const version = await resolveTarget(context);
  const entry: DesiredModule = {
    package: context.catalogEntry.package,
    version,
    enabled: true,
    config: {},
  };
  context.state.modules[context.id] = entry;
  await save(context);
  await load(context.id, entry);
}

async function runUpdate(context: OperationContext): Promise<void> {
  const entry = context.state.modules[context.id];
  const version = await resolveTarget(context);
  await unload(context.id);
  context.state.modules[context.id] = { ...entry, version };
  await save(context);
  if (entry.enabled) await load(context.id, { ...entry, version });
}

async function runEnable(context: OperationContext): Promise<void> {
  const entry = { ...context.state.modules[context.id], enabled: true };
  context.state.modules[context.id] = entry;
  await save(context);
  await load(context.id, entry);
}

async function runDisable(context: OperationContext): Promise<void> {
  await unload(context.id);
  context.state.modules[context.id].enabled = false;
  await save(context);
}

async function runUninstall(context: OperationContext): Promise<void> {
  await unload(context.id);
  delete context.state.modules[context.id];
  await save(context);
}

/** Brings the runtime in line with the file for one module. */
async function runApply(context: OperationContext): Promise<void> {
  const entry = context.state.modules[context.id];
  const runtime = await listRuntimeModules();
  const live = isLive(runtime.get(storeModuleId(context.id)));
  if (entry?.enabled && !live) await load(context.id, entry);
  if (!entry?.enabled && live) await unload(context.id);
}

const RUNNERS: Record<StoreOperationKind, OperationRunner> = {
  install: runInstall,
  update: runUpdate,
  enable: runEnable,
  disable: runDisable,
  uninstall: runUninstall,
  apply: runApply,
};

/** Which state of the file entry each operation starts from. */
const PRECONDITIONS: Record<
  StoreOperationKind,
  (entry: DesiredModule | undefined) => boolean
> = {
  install: (entry) => entry === undefined,
  update: (entry) => entry !== undefined,
  enable: (entry) => entry?.enabled === false,
  disable: (entry) => entry?.enabled === true,
  uninstall: (entry) => entry !== undefined,
  apply: () => true,
};

/**
 * Puts the file back as it was and, for an update, the previous version back
 * in the runtime: a failed operation leaves the platform as it found it.
 */
async function rollback(context: OperationContext): Promise<void> {
  await writeDesiredState(context.projectPath, context.snapshot);
  const previous = context.snapshot.modules[context.id];
  const runtime = await listRuntimeModules();
  const live = isLive(runtime.get(storeModuleId(context.id)));
  if (previous?.enabled && !live) await loadStoreModule(context.id, previous);
}

async function execute(
  kind: StoreOperationKind,
  context: OperationContext,
): Promise<void> {
  try {
    await RUNNERS[kind](context);
    errors.delete(context.id);
  } catch (error) {
    const message = describeError(error);
    Logging.Error(`[DMS] Module store: ${kind} ${context.id} failed`, error);
    errors.set(context.id, message);
    await rollback(context).catch((rollbackError: unknown) =>
      Logging.Error(
        `[DMS] Module store: rolling back ${context.id} failed`,
        rollbackError,
      ),
    );
  }
}

async function assertNotDeclaredByConfig(
  catalogEntry: StoreCatalogEntry,
): Promise<void> {
  const runtime = await listRuntimeModules();
  assert(
    !isDeclaredByConfig(runtime, catalogEntry.package),
    HTTP_CONFLICT,
    "error.store_managed_by_config",
  );
}

async function prepareContext(
  kind: StoreOperationKind,
  id: string,
): Promise<OperationContext> {
  const catalogEntry = await findCatalogEntry(id);
  assert(catalogEntry, HTTP_NOT_FOUND, "error.store_module_unknown");
  await assertNotDeclaredByConfig(catalogEntry);
  const { projectPath } = await GetRuntimeInfo();
  const state = await readDesiredState(projectPath);
  assert(
    PRECONDITIONS[kind](state.modules[id]),
    HTTP_CONFLICT,
    "error.store_invalid_state",
  );
  return { id, catalogEntry, projectPath, state, snapshot: cloneState(state) };
}

function enqueue(work: () => Promise<void>): Promise<void> {
  const run = queue.then(work);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Starts `kind` on module `id` and returns once it is accepted: the work runs
 * in the background and the listing shows its progress. One operation runs at
 * a time; a request made while one runs is refused, not queued, so an owner
 * never sees a click take effect minutes later.
 */
export async function startStoreOperation(
  kind: StoreOperationKind,
  id: string,
): Promise<void> {
  assert(
    getStoreConfig().enabled !== false,
    HTTP_FORBIDDEN,
    "error.store_disabled",
  );
  assert(!current, HTTP_CONFLICT, "error.store_busy");
  setCurrent({ moduleId: id, kind, step: "resolve", startedAt: Date.now() });
  try {
    const context = await prepareContext(kind, id);
    void enqueue(() =>
      execute(kind, context).finally(() => {
        setCurrent(undefined);
      }),
    ).catch((error: unknown) =>
      Logging.Error(`[DMS] Module store: ${kind} ${id} failed`, error),
    );
  } catch (error) {
    setCurrent(undefined);
    throw error;
  }
}

async function reconcileEntry(
  id: string,
  entry: DesiredModule,
  runtime: ReadonlyMap<string, RuntimeModule>,
): Promise<void> {
  if (!entry.enabled || isLive(runtime.get(storeModuleId(id)))) return;
  setCurrent({
    moduleId: id,
    kind: "apply",
    step: "load",
    startedAt: Date.now(),
  });
  try {
    if (isDeclaredByConfig(runtime, entry.package)) {
      throw new Error(
        `${entry.package} is also declared in antelope.config.ts`,
      );
    }
    await load(id, entry);
    errors.delete(id);
  } catch (error) {
    errors.set(id, describeError(error));
    Logging.Error(`[DMS] Module store: loading ${id} at boot failed`, error);
  } finally {
    setCurrent(undefined);
  }
}

/**
 * Loads every enabled module of the desired-state file that is not running.
 * A module that fails is marked in error and the others still load: a store
 * module never keeps the DMS from starting.
 */
async function reconcileAll(runGeneration: number): Promise<void> {
  const { projectPath } = await GetRuntimeInfo();
  const state = await readDesiredState(projectPath);
  const runtime = await listRuntimeModules();
  for (const [id, entry] of Object.entries(state.modules)) {
    if (runGeneration !== generation) return;
    await reconcileEntry(id, entry, runtime);
  }
}

/**
 * Schedules the boot reconciliation behind the DMS's own start, without
 * waiting for it: loading a module constructs it through the runtime, which
 * must not happen while the runtime is still starting the DMS.
 */
export function scheduleStoreReconciliation(): void {
  if (getStoreConfig().enabled === false) return;
  const runGeneration = ++generation;
  setImmediate(() => {
    void enqueue(() => reconcileAll(runGeneration)).catch((error: unknown) =>
      Logging.Error("[DMS] Module store: boot reconciliation failed", error),
    );
  });
}

export function stopStoreReconciliation(): void {
  generation += 1;
}
