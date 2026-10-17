import type { Tone } from "#dms-ui/app/types/tone";
import type { StatusPillDot } from "#dms-ui/app/components/status-pill/StatusPill.vue";
import type { ModuleCatalogEntry } from "../../types/page";
import type {
  StoreListingEntry,
  StoreModuleState,
  StoreOperationKind,
} from "../../types/module-store";
import type { DisplayResolver } from "./modules-catalog";

/** A store module as the Modules page filters and draws it. */
export type ModuleStoreEntry = StoreListingEntry & {
  /** Store category, a `$i18n.key` (what the category chips read). */
  catalogCategory: string;
};

/** Which store modules the store section shows. */
export type StoreScope = "all" | "available" | "installed";

/** What a store tile's pill says. */
export interface StoreTileStatus {
  tone: Tone;
  /** i18n key under `modules.store.state`. */
  labelKey: string;
  dot?: StatusPillDot;
}

/** One action a store tile offers. */
export interface StoreAction {
  kind: StoreOperationKind;
  /** i18n key under `modules.store.actions`. */
  labelKey: string;
  icon: string;
  /** The action runs only once the owner confirms it. */
  confirm?: boolean;
  /**
   * Offered in the tile's menu only, never as its button: pausing or
   * removing a running module is not what its tile should invite.
   */
  isMenuOnly?: boolean;
}

const CATEGORY_PREFIX = "$modules.store.category";

/** The command that turns a production frontend into one serving new layers. */
export const FRONTEND_BUILD_COMMAND = "ajs dms build";

const STATUSES: Record<StoreModuleState, StoreTileStatus> = {
  available: { tone: "neutral", labelKey: "available", dot: "none" },
  busy: { tone: "info", labelKey: "busy", dot: "live" },
  active: { tone: "success", labelKey: "active" },
  disabled: { tone: "neutral", labelKey: "disabled" },
  error: { tone: "error", labelKey: "error" },
  pending: { tone: "warning", labelKey: "pending" },
};

const ACTIONS: Record<StoreOperationKind, StoreAction> = {
  install: {
    kind: "install",
    labelKey: "install",
    icon: "i-ph-download-simple",
  },
  update: { kind: "update", labelKey: "update", icon: "i-ph-arrow-circle-up" },
  enable: { kind: "enable", labelKey: "enable", icon: "i-ph-play" },
  disable: {
    kind: "disable",
    labelKey: "disable",
    icon: "i-ph-pause",
    isMenuOnly: true,
  },
  uninstall: {
    kind: "uninstall",
    labelKey: "uninstall",
    icon: "i-ph-trash",
    confirm: true,
    isMenuOnly: true,
  },
  apply: { kind: "apply", labelKey: "apply", icon: "i-ph-arrows-clockwise" },
};

/** States of a module that antelope.config.ts declares. */
const INSTALLED_STATES = new Set<StoreModuleState>([
  "active",
  "disabled",
  "pending",
]);

export function toModuleStoreEntry(
  entry: StoreListingEntry,
  registeredModules: readonly Pick<ModuleCatalogEntry, "id" | "title">[] = [],
): ModuleStoreEntry {
  return {
    ...entry,
    // The registration also names Installed and navigation. Keep the catalog
    // fallback for unloaded modules, whose translations may not be served.
    title:
      registeredModules.find((module) => module.id === entry.id)?.title ??
      entry.title,
    catalogCategory: `${CATEGORY_PREFIX}.${entry.category}`,
  };
}

/** Whether the module is installed, from the store or by the config. */
export function isInstalled(entry: StoreListingEntry): boolean {
  if (INSTALLED_STATES.has(entry.state)) return true;
  return entry.installedVersion !== undefined;
}

export function filterByScope<T extends StoreListingEntry>(
  entries: readonly T[],
  scope: StoreScope,
): T[] {
  if (scope === "all") return [...entries];
  const wantsInstalled = scope === "installed";
  return entries.filter((entry) => isInstalled(entry) === wantsInstalled);
}

/** The store modules, alphabetical by their shown name. */
export function sortStoreModules<T extends StoreListingEntry>(
  entries: readonly T[],
  resolve: DisplayResolver,
): T[] {
  return [...entries].sort((a, b) =>
    resolve(a.title).localeCompare(resolve(b.title)),
  );
}

export function storeTileStatus(entry: StoreListingEntry): StoreTileStatus {
  if (entry.state === "active" && entry.updateAvailable) {
    return { tone: "warning", labelKey: "update_available" };
  }
  return STATUSES[entry.state];
}

/**
 * What the tile offers, the main action first. A module in error offers to
 * try its last step again: installing it when the file does not hold it,
 * applying the file otherwise.
 */
export function storeActions(entry: StoreListingEntry): StoreAction[] {
  const installed = entry.installedVersion !== undefined;
  const byState: Record<StoreModuleState, StoreOperationKind[]> = {
    available: ["install"],
    busy: [],
    active: entry.updateAvailable
      ? ["update", "disable", "uninstall"]
      : ["disable", "uninstall"],
    disabled: ["enable", "uninstall"],
    error: installed ? ["apply", "uninstall"] : ["install"],
    pending: ["apply", "uninstall"],
  };
  return byState[entry.state].map((kind) => ACTIONS[kind]);
}

/**
 * Whether the page waits on the frontend for this module: its backend side
 * changed and the frontend server has not reported serving it yet.
 */
export function isAwaitingFrontend(entry: StoreListingEntry): boolean {
  return entry.state !== "busy" && entry.frontend === "pending";
}

/** Why an action the tile offers cannot run, as the tile explains it. */
export type StoreActionBlock =
  | "no_release"
  | "incompatible"
  | "frontend"
  | "interfaces"
  | "dependents";

/** Actions that load a new release of the module. */
const RELEASE_ACTIONS = new Set<StoreOperationKind>(["install", "update"]);
/**
 * Actions that pick the missing interfaces' modules in a dialog; the others
 * refuse a release that misses one.
 */
const PICKS_DEPENDENCIES = new Set<StoreOperationKind>(["install"]);
/** Actions that take a running module down. */
const TAKE_DOWN_ACTIONS = new Set<StoreOperationKind>(["disable", "uninstall"]);

function releaseBlock(
  entry: StoreListingEntry,
  kind: StoreOperationKind,
): StoreActionBlock | undefined {
  if (!entry.latestVersion) return "no_release";
  if (!entry.compatible) return "incompatible";
  if (entry.frontendRequirement) return "frontend";
  if (!PICKS_DEPENDENCIES.has(kind) && entry.missingInterfaces.length > 0) {
    return "interfaces";
  }
  return undefined;
}

/** Why `kind` cannot run on the module, or undefined when it can. */
export function storeActionBlock(
  entry: StoreListingEntry,
  kind: StoreOperationKind,
): StoreActionBlock | undefined {
  if (RELEASE_ACTIONS.has(kind)) return releaseBlock(entry, kind);
  if (TAKE_DOWN_ACTIONS.has(kind) && entry.dependents.length > 0) {
    return "dependents";
  }
  return undefined;
}

/** Whether `kind` first asks which modules implement the missing interfaces. */
export function needsDependencyChoice(
  entry: StoreListingEntry,
  kind: StoreOperationKind,
): boolean {
  return PICKS_DEPENDENCIES.has(kind) && entry.missingInterfaces.length > 0;
}
