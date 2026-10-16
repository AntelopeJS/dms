/**
 * Mirror of the backend's module store listing (`GET /dms/store/listing`,
 * `src/store/types.ts` in `@antelopejs/dms`).
 */
export type StoreModuleState =
  | "available"
  | "busy"
  | "active"
  | "disabled"
  | "error"
  | "pending";

export type StoreFrontendState = "none" | "synced" | "pending" | "unknown";

export type StoreOperationKind =
  | "install"
  | "update"
  | "enable"
  | "disable"
  | "uninstall"
  | "apply";

export type StoreOperationStep =
  | "resolve"
  | "dependencies"
  | "unload"
  | "load"
  | "save";

export interface StoreOperation {
  moduleId: string;
  kind: StoreOperationKind;
  step: StoreOperationStep;
  targetVersion?: string;
  startedAt: number;
}

/** A module of the AntelopeJS interfaces registry that implements an interface. */
export interface InterfaceImplementation {
  /** Name the registry gives it, such as `redis`. */
  name: string;
  /** npm package it is installed from. */
  package: string;
}

/** An interface the release to install needs and no running module implements. */
export interface MissingInterface {
  interfacePackage: string;
  /** Registry modules that implement it, npm packages only. */
  candidates: InterfaceImplementation[];
}

/** A frontend layer that would stop loading on another dms-frontend. */
export interface FrontendBreak {
  name: string;
  /** The dms-frontend range the layer supports. */
  range: string;
}

/** Why a release cannot load on the running dms-frontend, and what moving it would take. */
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

export interface StoreListingEntry {
  id: string;
  package: string;
  icon: string;
  /** Store category key, under `modules.store.category`. */
  category: string;
  /** `$i18n.key` */
  title: string;
  /** `$i18n.key` */
  description: string;
  state: StoreModuleState;
  installedVersion?: string;
  /** The version range antelope.config.ts declares. */
  declaredRange?: string;
  latestVersion?: string;
  updateAvailable: boolean;
  compatible: boolean;
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
  /** Running modules that need an interface only this one implements. */
  dependents: string[];
}

export interface StoreListing {
  enabled: boolean;
  modules: StoreListingEntry[];
  busy: boolean;
  interfaceVersion: string;
  dev: boolean;
  /** Why antelope.config.ts cannot be read or edited, when it cannot. */
  configError?: string;
  /** The dms-frontend version that runs, when the store can tell. */
  frontendVersion?: string;
  frontendVersionSource?: FrontendVersionSource;
}

/** A module the owner picked to implement a missing interface. */
export interface StoreDependencyChoice {
  interfacePackage: string;
  /** npm package, never a git or local source. */
  package: string;
  /** Config written to its antelope.config.ts entry. */
  config?: Record<string, unknown>;
}

/** Body of `POST /dms/store/<kind>`; only an install carries dependencies. */
export interface StoreActionBody {
  id: string;
  dependencies?: StoreDependencyChoice[];
}
