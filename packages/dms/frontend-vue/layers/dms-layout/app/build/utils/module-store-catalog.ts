import type { Tone } from "#dms-core/app/types/tone";
import type { StatusPillDot } from "#dms-ui/app/components/status-pill/StatusPill.vue";
import {
  type ModuleCatalogEntry,
  MODULE_URL_PREFIX,
} from "#dms-core/app/types/page";
import type {
  ModuleSourceKind,
  StoreListingEntry,
  StoreModuleState,
  StoreOperationKind,
} from "#dms-core/app/types/module-store";
import {
  type DisplayResolver,
  compareDisplayNames,
  moduleStatus,
} from "./modules-catalog";

/** A store module as the Modules page filters and draws it. */
export type ModuleStoreEntry = StoreListingEntry & {
  /** Store category, a `$i18n.key` (what the category chips read). */
  catalogCategory: string;
};

/** Which store modules the store section shows. */
export type StoreScope = "all" | "available" | "installed";

/**
 * The scopes in the order the store's switch shows them. The store is for
 * discovering, so it opens on what can still be installed; "all" comes last,
 * the widest view.
 */
export const STORE_SCOPES: readonly StoreScope[] = [
  "available",
  "installed",
  "all",
];

/** The scope the store opens on. */
export const DEFAULT_STORE_SCOPE: StoreScope = "available";

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

/** The icon a tile's footer names a module's source with. */
export const MODULE_SOURCE_ICONS: Record<ModuleSourceKind, string> = {
  npm: "i-ph-package",
  github: "i-ph-github-logo",
  gitlab: "i-ph-gitlab-logo",
  git: "i-ph-git-branch",
  local: "i-ph-folder-simple",
};

/** The command that turns a production frontend into one serving new layers. */
export const FRONTEND_BUILD_COMMAND = "ajs dms build";

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

/**
 * The category a module is filed under, the same on its installed tile and
 * its store tile: the one its registration names, else the store catalog's.
 */
export function resolveCatalogCategory(
  registered: Pick<ModuleCatalogEntry, "catalogCategory"> | undefined,
  entry: Pick<StoreListingEntry, "category">,
): string {
  return (
    registered?.catalogCategory?.trim() ||
    `${CATEGORY_PREFIX}.${entry.category}`
  );
}

export function toModuleStoreEntry(
  entry: StoreListingEntry,
  registeredModules: readonly Pick<
    ModuleCatalogEntry,
    "id" | "title" | "catalogCategory"
  >[] = [],
): ModuleStoreEntry {
  const registered = registeredModules.find((module) => module.id === entry.id);
  return {
    ...entry,

    title: registered?.title ?? entry.title,
    catalogCategory: resolveCatalogCategory(registered, entry),
  };
}

/** A version as written, not a range: what an installed tile prints. */
const PLAIN_VERSION = /^\d+\.\d+\.\d+/;

/**
 * Installed modules with the version, category and source their registration
 * leaves out, read from the store listing of the same id. A module that registers
 * neither still reads like the others on its tile and in the filters.
 */
export function withStoreDetails<T extends ModuleCatalogEntry>(
  modules: readonly T[],
  store: readonly StoreListingEntry[],
): T[] {
  const byId = new Map(store.map((entry) => [entry.id, entry]));
  return modules.map((module) => {
    const entry = byId.get(module.id);
    if (!entry) return module;
    const installed = entry.installedVersion;
    return {
      ...module,
      version:
        module.version ??
        (installed && PLAIN_VERSION.test(installed) ? installed : undefined),
      catalogCategory: resolveCatalogCategory(module, entry),
      source: entry.source,
    };
  });
}

/**
 * Where a store tile's Open button leads: the landing page of the installed
 * module of the same id, when the caller may open it and it has pages (a
 * module without one lands on its own address, which has nothing to show).
 */
export function storeOpenTarget(
  entry: Pick<StoreListingEntry, "id">,
  installedModules: readonly Pick<
    ModuleCatalogEntry,
    "id" | "hasAccess" | "landingSlug"
  >[],
): string | undefined {
  const module = installedModules.find(
    (candidate) => candidate.id === entry.id,
  );
  if (!module?.hasAccess || !module.landingSlug) return undefined;
  const ownAddress = `${MODULE_URL_PREFIX}/${entry.id}`;
  return module.landingSlug === ownAddress ? undefined : module.landingSlug;
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

/** The store modules, alphabetical by their shown name in `locale`'s order. */
export function sortStoreModules<T extends StoreListingEntry>(
  entries: readonly T[],
  resolve: DisplayResolver,
  locale?: string,
): T[] {
  const compare = compareDisplayNames(locale);
  return [...entries].sort((a, b) =>
    compare(resolve(a.title), resolve(b.title)),
  );
}

/**
 * What the tile offers, the main action first. A module in error offers to
 * try its last step again: installing it when the file does not hold it,
 * applying the file otherwise.
 */
export function storeActions(entry: StoreListingEntry): StoreAction[] {
  if (entry.isWorkingCopy) return [];
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
  | "used_by_project"
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
  if (!TAKE_DOWN_ACTIONS.has(kind)) return undefined;

  if (entry.usedByProject) return "used_by_project";
  return entry.dependents.length > 0 ? "dependents" : undefined;
}

/** Translates an i18n key with its named parameters. */
export type StoreTranslate = (
  key: string,
  params?: Record<string, string>,
) => string;

const LIST_SEPARATOR = ", ";

const BLOCK_MESSAGES: Record<
  StoreActionBlock,
  (entry: StoreListingEntry, t: StoreTranslate) => string
> = {
  no_release: (_entry, t) => t("modules.store.no_release"),
  incompatible: (entry, t) =>
    t("modules.store.incompatible", {
      range: entry.requiredInterfaceRange ?? "",
    }),
  frontend: (entry, t) =>
    t("modules.store.frontend_requirement.needs", {
      range: entry.frontendRequirement?.range ?? "",
      running: entry.frontendRequirement?.running ?? "",
    }),
  interfaces: (entry, t) =>
    t("modules.store.requires_first", {
      interfaces: entry.missingInterfaces
        .map((missing) => missing.interfacePackage)
        .join(LIST_SEPARATOR),
    }),
  used_by_project: (_entry, t) => t("modules.store.used_by_project"),
  dependents: (entry, t) =>
    t("modules.store.used_by", {
      modules: entry.dependents.join(LIST_SEPARATOR),
    }),
};

/** Why `kind` cannot run on the module, worded for its tile, if it cannot. */
export function storeBlockMessage(
  entry: StoreListingEntry,
  kind: StoreOperationKind,
  t: StoreTranslate,
): string | undefined {
  const block = storeActionBlock(entry, kind);
  return block ? BLOCK_MESSAGES[block](entry, t) : undefined;
}

/** Whether `kind` first asks which modules implement the missing interfaces. */
export function needsDependencyChoice(
  entry: StoreListingEntry,
  kind: StoreOperationKind,
): boolean {
  return PICKS_DEPENDENCIES.has(kind) && entry.missingInterfaces.length > 0;
}

/** What an installed module's pill says. */
export interface InstalledTileStatus {
  tone: Tone;
  /** Full i18n key of the label. */
  labelKey: string;
  dot?: StatusPillDot;
}

/** Store states an installed module's pill says before anything else. */
const STORE_STATE_PILLS: Partial<
  Record<StoreModuleState, InstalledTileStatus>
> = {
  busy: { tone: "info", labelKey: "modules.store.state.busy", dot: "live" },
  error: { tone: "error", labelKey: "modules.store.state.error" },
  disabled: { tone: "warning", labelKey: "modules.store.state.disabled" },
  pending: { tone: "warning", labelKey: "modules.store.state.pending" },
};

const MODULE_STATUS_PILLS: Record<
  ReturnType<typeof moduleStatus>,
  InstalledTileStatus
> = {
  live: { tone: "success", labelKey: "modules.status.live" },
  beta: { tone: "secondary", labelKey: "modules.status.beta" },
  update: { tone: "warning", labelKey: "modules.status.update" },
  attention: { tone: "error", labelKey: "modules.status.attention" },
};

/**
 * The pill of an installed module: what the store says of it first (an
 * operation, an error, paused, not applied, a frontend to restart, an
 * update), then what the module reports of itself, Active otherwise.
 */
export function installedTileStatus(
  module: ModuleCatalogEntry,
  entry: StoreListingEntry | undefined,
): InstalledTileStatus {
  const storeStatus = entry && STORE_STATE_PILLS[entry.state];
  if (storeStatus) return storeStatus;
  if (entry && isAwaitingFrontend(entry)) {
    return { tone: "warning", labelKey: "modules.status.restart_required" };
  }
  if (entry?.updateAvailable) {
    return { tone: "warning", labelKey: "modules.status.update" };
  }
  return MODULE_STATUS_PILLS[moduleStatus(module)];
}

/**
 * Installed store modules that register no module of their own, as the
 * Installed grid lists them: a paused module, one that did not start, or one
 * without pages. antelope.config.ts still declares them, so they stay listed
 * and managed there, with what the store knows of them.
 */
export function storeOnlyModules(
  store: readonly ModuleStoreEntry[],
  registered: readonly Pick<ModuleCatalogEntry, "id">[],
): ModuleCatalogEntry[] {
  const registeredIds = new Set(registered.map((module) => module.id));
  return store
    .filter((entry) => isInstalled(entry) && !registeredIds.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      icon: entry.icon,
      hasAccess: true,

      landingSlug: "",
      catalogCategory: entry.catalogCategory,
      version:
        entry.installedVersion && PLAIN_VERSION.test(entry.installedVersion)
          ? entry.installedVersion
          : undefined,
      source: entry.source,
    }));
}
