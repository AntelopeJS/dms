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
  | "pending"
  | "config";

export type StoreFrontendState = "none" | "synced" | "pending" | "unknown";

export type StoreOperationKind =
  | "install"
  | "update"
  | "enable"
  | "disable"
  | "uninstall"
  | "apply";

export type StoreOperationStep = "resolve" | "unload" | "load" | "save";

export interface StoreOperation {
  moduleId: string;
  kind: StoreOperationKind;
  step: StoreOperationStep;
  targetVersion?: string;
  startedAt: number;
}

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
  latestVersion?: string;
  updateAvailable: boolean;
  compatible: boolean;
  requiredInterfaceRange?: string;
  error?: string;
  operation?: StoreOperation;
  frontend: StoreFrontendState;
}

export interface StoreListing {
  enabled: boolean;
  modules: StoreListingEntry[];
  busy: boolean;
  interfaceVersion: string;
  dev: boolean;
  stateFile: string;
  stateError?: string;
}
