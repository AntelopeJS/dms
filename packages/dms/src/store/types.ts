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
  /** The release's `dependencies`, interface packages among them. */
  dependencies?: Record<string, string>;
  /** Interfaces the release implements, its own interface included. */
  implements?: string[];
}

/**
 * Where a module's code comes from, as its tile names it: an npm package, a
 * GitHub or GitLab repository, another git host, or a local folder.
 */
export type ModuleSourceKind = "npm" | "github" | "gitlab" | "git" | "local";

/** A module loaded in the runtime, reduced to what the store compares. */
export interface RuntimeModule {
  id: string;
  /** The npm package of its source, or the name its manifest gives. */
  packageName?: string;
  /** The version its manifest gives. */
  version?: string;
  /** Loaded from npm, rather than from a local folder or git. */
  isPackageSource: boolean;
  /** Where its code comes from; absent when the runtime does not say. */
  sourceKind?: ModuleSourceKind;
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
export type StoreOperationStep =
  | "resolve"
  | "dependencies"
  | "unload"
  | "load"
  | "save";

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

/** A module of the AntelopeJS interfaces registry that implements an interface. */
export interface InterfaceImplementation {
  /** Name the registry gives it, such as `redis`. */
  name: string;
  /** npm package it is installed from. */
  package: string;
}

/**
 * An interface a release depends on that no running module implements: the
 * core refuses to load the release until one does.
 */
export interface MissingInterface {
  interfacePackage: string;
  /** Registry modules that implement it, npm packages only. */
  candidates: InterfaceImplementation[];
}

/** What keeps a running module from being paused or removed. */
export interface ModuleDependents {
  /** Other running modules, by package name: they can be removed first. */
  modules: string[];
  /** The project's own code needs it: only a change to that code frees it. */
  usedByProject: boolean;
}

/** A frontend layer that would stop loading on another dms-frontend. */
export interface FrontendBreak {
  /** Name of the frontend layer. */
  name: string;
  /** The dms-frontend range the layer supports. */
  range: string;
}

/**
 * Why a release cannot load on the running dms-frontend, and what moving
 * dms-frontend would take.
 */
export interface FrontendRequirement {
  /** The dms-frontend range the release supports. */
  range: string;
  /** The dms-frontend version that runs. */
  running: string;
  /** Latest published dms-frontend in the range, when there is one. */
  target?: string;
  /** Command that moves the project to `target`. */
  command?: string;
  /** Layers already loaded that `target` would refuse. */
  breaks: FrontendBreak[];
}

/** Where the store read the running dms-frontend version. */
export type FrontendVersionSource = "reported" | "project";

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
  /**
   * Where the module's code comes from: npm for what the store installs or
   * would, the working copy's own source otherwise.
   */
  source: ModuleSourceKind;
  /**
   * The module runs from a local folder or git working copy that
   * antelope.config.ts declares: it counts as active, but the store offers
   * no action on it, the developer owns that entry.
   */
  isWorkingCopy?: boolean;
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
  /** The dms-frontend range the release to install declares, when it does. */
  frontendRange?: string;
  /** Set when that range excludes the running dms-frontend. */
  frontendRequirement?: FrontendRequirement;
  /** Interfaces the release to install needs and nothing implements. */
  missingInterfaces: MissingInterface[];
  /**
   * Running modules that need an interface only this one implements: it
   * cannot be paused or removed while they run. The project is never one of
   * them, it is `usedByProject`.
   */
  dependents: string[];
  /**
   * The project's own code needs an interface only this module implements:
   * it cannot be paused or removed until that code stops using it.
   */
  usedByProject: boolean;
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
  /** The dms-frontend version that runs, when the store can tell. */
  frontendVersion?: string;
  frontendVersionSource?: FrontendVersionSource;
}

/**
 * A module the owner picked to implement a missing interface, installed with
 * the module that needs it.
 */
export interface StoreDependencyChoice {
  interfacePackage: string;
  /** npm package, never a git or local source. */
  package: string;
  /** Config written to its antelope.config.ts entry. */
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Modules own their configuration schemas; the store transports these values without imposing a DMS schema.
  config?: Record<string, unknown>;
}
