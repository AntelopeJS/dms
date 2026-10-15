/** One official module the store offers, as the catalog lists it. */
export interface StoreCatalogEntry {
  /** Catalog id, also the key of the module in the desired-state file. */
  id: string;
  /** npm package the module is installed from. */
  package: string;
  /** Iconify name of the module. */
  icon: string;
  /** Store category key, under `modules.store.category`. */
  category: string;
}

/** The catalog document, bundled or fetched from `store.catalogUrl`. */
export interface StoreCatalog {
  version: number;
  modules: StoreCatalogEntry[];
}

/** What the desired-state file asks for one store module. */
export interface DesiredModule {
  package: string;
  /** Exact version, pinned when the module is installed or updated. */
  version: string;
  enabled: boolean;
  /** Passed to the module as its configuration. */
  config?: Record<string, unknown>;
}

/** The desired-state file: every module the store manages, by catalog id. */
export interface DesiredState {
  modules: Record<string, DesiredModule>;
}

/** The latest release of a package, as the npm registry describes it. */
export interface PackageRelease {
  version: string;
  /** Range of `@antelopejs/interface-dms` the release depends on. */
  interfaceRange?: string;
}

/** A module loaded in the runtime, reduced to what the store compares. */
export interface RuntimeModule {
  id: string;
  packageName?: string;
  version?: string;
  status: string;
  localPath: string;
}

export type StoreOperationKind =
  | "install"
  | "update"
  | "enable"
  | "disable"
  | "uninstall"
  | "apply";

/** Where a running operation is. */
export type StoreOperationStep = "resolve" | "unload" | "load" | "save";

/** The operation the store is running, if any. */
export interface StoreOperation {
  moduleId: string;
  kind: StoreOperationKind;
  step: StoreOperationStep;
  /** Version the module moves to, for an install or an update. */
  targetVersion?: string;
  startedAt: number;
}

/**
 * What a store module is, crossing the catalog, the desired-state file and
 * the runtime. `config` is a module the project declares in
 * `antelope.config.ts`: the store shows it and leaves it alone. `pending` is a
 * file entry the runtime does not match yet (a hand edit), which Apply
 * reconciles.
 */
export type StoreModuleState =
  | "available"
  | "busy"
  | "active"
  | "disabled"
  | "error"
  | "pending"
  | "config";

/**
 * Whether the running frontend serves the module's interface: `none` when
 * the module has no frontend layer, `unknown` when no frontend server has
 * reported what it serves.
 */
export type StoreFrontendState = "none" | "synced" | "pending" | "unknown";

/** One module of the store listing. */
export interface StoreListingEntry {
  id: string;
  package: string;
  icon: string;
  category: string;
  title: string;
  description: string;
  state: StoreModuleState;
  installedVersion?: string;
  latestVersion?: string;
  updateAvailable: boolean;
  compatible: boolean;
  /** Interface range the latest release needs, when it is not compatible. */
  requiredInterfaceRange?: string;
  error?: string;
  operation?: StoreOperation;
  frontend: StoreFrontendState;
}

/** `GET /dms/store/listing`. */
export interface StoreListing {
  enabled: boolean;
  modules: StoreListingEntry[];
  /** True while an operation runs: every other action waits. */
  busy: boolean;
  /** Installed `@antelopejs/interface-dms` version. */
  interfaceVersion: string;
  /**
   * Whether the backend runs in development, where `ajs dms dev` picks a new
   * layer up by itself; a production frontend has to be rebuilt.
   */
  dev: boolean;
  /** The desired-state file, relative to the project. */
  stateFile: string;
  /** Why the desired-state file could not be read, when it could not. */
  stateError?: string;
}
