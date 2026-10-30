import { assert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import { removeFrontendModulesUnder } from "./internal/frontend/frontend-modules";
import { setStoreOperationRunning } from "./activity";
import { findCatalogEntry } from "./catalog";
import { isCompatible, installedInterfaceVersion } from "./compatibility";
import {
  hasDeclaration,
  listCatalogDeclarations,
  packageDeclarationSource,
  removeDeclaration,
  saveDeclaration,
} from "./declarations";
import {
  assertFrontendSupports,
  assertNoDependents,
  caretRange,
  installDependency,
  pickDependencies,
} from "./requirements";
import { INTERFACE_PACKAGE, latestRelease } from "./registry";
import {
  describeRuntimeModule,
  findWorkingCopy,
  isLive,
  listRuntimeModules,
  loadStoreModule,
  packageRuntimeId,
  unloadStoreModule,
} from "./runtime";
import type {
  PackageRelease,
  StoreCatalogEntry,
  StoreDeclaration,
  StoreDependencyChoice,
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
  /** The module's key in antelope.config.ts, existing or about to be. */
  key: string;
  /** The entry as it was before the operation, restored if it fails. */
  declaration?: StoreDeclaration;
  /** The entry the operation wrote, if it got that far. */
  written: boolean;
  /** Modules the owner picked for the interfaces the release misses. */
  dependencies: StoreDependencyChoice[];
  /** Keys of the dependencies this operation loaded, undone on failure. */
  installedDependencies: string[];
}

/** What an operation may carry besides the module it acts on. */
export interface StoreOperationOptions {
  dependencies?: StoreDependencyChoice[];
}

type OperationRunner = (context: OperationContext) => Promise<void>;

let current: StoreOperation | undefined;
let queue: Promise<void> = Promise.resolve();
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

function describeError(error: PromiseRejectedResult["reason"]): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(describeError).join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

async function load(
  context: OperationContext,
  range: string,
  config?: StoreDeclaration["config"],
): Promise<void> {
  setStep("load");
  await loadStoreModule(context.key, {
    package: context.catalogEntry.package,
    range,
    config,
  });
  removedLayers.delete(context.id);
}

async function unload(context: OperationContext): Promise<void> {
  setStep("unload");
  const module = await describeRuntimeModule(context.key);
  if (!module || !isLive(module)) return;
  await unloadStoreModule(context.key);
  const removed = removeFrontendModulesUnder(module.localPath);
  if (removed.length > 0) removedLayers.set(context.id, removed);
}

async function writeEntry(
  context: OperationContext,
  write: () => Promise<void>,
): Promise<void> {
  setStep("save");
  context.written = true;
  await write();
}

/**
 * The range an install or an update writes: a caret on the latest release,
 * refused when it needs another `@antelopejs/interface-dms` than the one
 * installed, as the runtime would refuse to load it.
 */
async function resolveTargetRelease(
  context: OperationContext,
): Promise<PackageRelease> {
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
  await assertFrontendSupports(context, release);
  return release;
}

async function installDependencies(
  context: OperationContext,
  release: PackageRelease,
): Promise<void> {
  const label = `${context.catalogEntry.package}@${release.version}`;
  const picked = await pickDependencies(context, release, label);
  if (picked.size === 0) return;
  setStep("dependencies");
  for (const [interfacePackage, choice] of picked) {
    await installDependency(context, interfacePackage, choice);
  }
}

function sourceFor(context: OperationContext, range: string) {
  return packageDeclarationSource(context.catalogEntry.package, range);
}

/**
 * Loads the module first and writes it to antelope.config.ts once it runs:
 * the file only ever names a module that loaded. Optional, so a later start
 * never fails on it.
 */
async function runInstall(context: OperationContext): Promise<void> {
  const release = await resolveTargetRelease(context);
  await installDependencies(context, release);
  const range = caretRange(release);
  await load(context, range);
  await writeEntry(context, () =>
    saveDeclaration(context.key, {
      source: sourceFor(context, range),
      optional: true,
    }),
  );
}

async function runUpdate(context: OperationContext): Promise<void> {
  const declaration = requireDeclaration(context);
  const release = await resolveTargetRelease(context);
  await pickDependencies(
    context,
    release,
    `${context.catalogEntry.package}@${release.version}`,
  );
  const range = caretRange(release);
  await unload(context);
  if (!declaration.disabled) await load(context, range, declaration.config);
  await writeEntry(context, () =>
    saveDeclaration(context.key, { source: sourceFor(context, range) }),
  );
}

async function runEnable(context: OperationContext): Promise<void> {
  const declaration = requireDeclaration(context);
  await load(context, declaration.range, declaration.config);
  await writeEntry(context, () =>
    saveDeclaration(context.key, { disabled: undefined }),
  );
}

async function runDisable(context: OperationContext): Promise<void> {
  await unload(context);
  await writeEntry(context, () =>
    saveDeclaration(context.key, { disabled: true }),
  );
}

async function runUninstall(context: OperationContext): Promise<void> {
  await unload(context);
  await writeEntry(context, () => removeDeclaration(context.key));
}

/** Brings the runtime in line with antelope.config.ts for one module. */
async function runApply(context: OperationContext): Promise<void> {
  const declaration = requireDeclaration(context);
  const live = isLive(await describeRuntimeModule(context.key));
  if (!declaration.disabled && !live) {
    await load(context, declaration.range, declaration.config);
  }
  if (declaration.disabled && live) await unload(context);
}

function requireDeclaration(context: OperationContext): StoreDeclaration {
  if (!context.declaration) {
    throw new Error(
      `${context.catalogEntry.package} is not in antelope.config.ts`,
    );
  }
  return context.declaration;
}

const RUNNERS: Record<StoreOperationKind, OperationRunner> = {
  install: runInstall,
  update: runUpdate,
  enable: runEnable,
  disable: runDisable,
  uninstall: runUninstall,
  apply: runApply,
};

/** Which state of the config entry each operation starts from. */
const PRECONDITIONS: Record<
  StoreOperationKind,
  (entry: StoreDeclaration | undefined) => boolean
> = {
  install: (entry) => entry === undefined,
  update: (entry) => entry !== undefined,
  enable: (entry) => entry?.disabled === true,
  disable: (entry) => entry?.disabled === false,
  uninstall: (entry) => entry !== undefined,
  apply: (entry) => entry !== undefined,
};

/** Puts the entry back as it was before the operation wrote it. */
async function restoreDeclaration(context: OperationContext): Promise<void> {
  const previous = context.declaration;
  if (!previous) {
    await removeDeclaration(context.key);
    return;
  }
  await saveDeclaration(context.key, {
    source: sourceFor(context, previous.range),
    disabled: previous.disabled ? true : undefined,
  });
}

/**
 * Leaves the platform as the operation found it: the config entry as it was,
 * and the previous version running again when it ran before.
 */
async function rollback(context: OperationContext): Promise<void> {
  await rollbackModule(context);
  for (const key of [...context.installedDependencies].reverse()) {
    await unloadStoreModule(key);
    if (await hasDeclaration(key)) await removeDeclaration(key);
  }
}

async function rollbackModule(context: OperationContext): Promise<void> {
  if (context.written) await restoreDeclaration(context);
  const previous = context.declaration;
  const live = isLive(await describeRuntimeModule(context.key));
  if (!previous && live) await unloadStoreModule(context.key);
  if (previous && !previous.disabled && !live) {
    await loadStoreModule(context.key, {
      package: context.catalogEntry.package,
      range: previous.range,
      config: previous.config,
    });
  }
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
    await rollback(context).catch((rollbackError) =>
      Logging.Error(
        `[DMS] Module store: rolling back ${context.id} failed`,
        rollbackError,
      ),
    );
  }
}

/** Operations that take a running module down. */
const TAKES_DOWN = new Set<StoreOperationKind>(["disable", "uninstall"]);

async function prepareContext(
  kind: StoreOperationKind,
  id: string,
  options: StoreOperationOptions,
): Promise<OperationContext> {
  const catalogEntry = await findCatalogEntry(id);
  assert(catalogEntry, HTTP_NOT_FOUND, "error.store_module_unknown");
  const { projectPath } = await GetRuntimeInfo();
  const declaration = (await listCatalogDeclarations([catalogEntry])).get(id);
  assert(
    PRECONDITIONS[kind](declaration),
    HTTP_CONFLICT,
    "error.store_invalid_state",
  );

  let key = declaration?.key ?? catalogEntry.package;
  if (!declaration) {
    const runtime = await listRuntimeModules();
    assert(
      !findWorkingCopy(catalogEntry.package, runtime.values()),
      HTTP_CONFLICT,
      "error.store_working_copy",
    );
    key = packageRuntimeId(catalogEntry.package, runtime.values());
  }
  const context: OperationContext = {
    id,
    catalogEntry,
    projectPath,
    key,
    declaration,
    written: false,
    dependencies: options.dependencies ?? [],
    installedDependencies: [],
  };
  if (TAKES_DOWN.has(kind)) await assertNoDependents(context);
  return context;
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
  options: StoreOperationOptions = {},
): Promise<void> {
  const { dev } = await GetRuntimeInfo();
  assert(dev, HTTP_FORBIDDEN, "error.store_disabled");
  assert(!current, HTTP_CONFLICT, "error.store_busy");
  setCurrent({ moduleId: id, kind, step: "resolve", startedAt: Date.now() });
  try {
    const context = await prepareContext(kind, id, options);
    void enqueue(() =>
      execute(kind, context).finally(() => {
        setCurrent(undefined);
      }),
    ).catch((error) =>
      Logging.Error(`[DMS] Module store: ${kind} ${id} failed`, error),
    );
  } catch (error) {
    setCurrent(undefined);
    throw error;
  }
}
