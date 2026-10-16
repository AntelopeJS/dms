/** One official module the store offers, as the catalog lists it. */
export interface StoreCatalogEntry {
  /** Catalog id, the join key with the module registry. */
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

/**
 * A catalog module as antelope.config.ts declares it, from npm, under `key`
 * in its `modules`.
 */
export interface StoreDeclaration {
  key: string;
  package: string;
  /** The version range the entry asks for. */
  range: string;
  disabled: boolean;
  config?: unknown;
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
 * What a store module is, crossing the catalog, antelope.config.ts and the
 * runtime. `pending` is an entry the runtime does not match: enabled but not
 * running (it failed to start, optional, or was added by hand), or disabled
 * but still running. Apply reconciles it.
 */
export type StoreModuleState =
  | "available"
  | "busy"
  | "active"
  | "disabled"
  | "error"
  | "pending";

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
  /** The version the runtime loaded, or the declared range when not loaded. */
  installedVersion?: string;
  /** The range antelope.config.ts declares. */
  declaredRange?: string;
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
  /** Why antelope.config.ts cannot be read or edited, when it cannot. */
  configError?: string;
}
