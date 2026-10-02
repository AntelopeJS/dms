import type { DisplayResolver } from "./modules-catalog";

/**
 * One official module offered by the module store preview. The list below is
 * static for now: it stands in for the AntelopeJS module registry the store
 * will read once installing from the dashboard is possible.
 */
export interface ModuleStoreEntry {
  /**
   * Id the module registers in the catalog (`RegisterModule({ id })`): a
   * store entry whose id is installed is hidden.
   */
  id: string;
  /** npm package the AntelopeJS CLI adds to the project. */
  packageName: string;
  /** Display name, a `$i18n.key`. */
  title: string;
  /** One-line summary, a `$i18n.key`. */
  description: string;
  /** Iconify name, the icon the module registers once installed. */
  icon: string;
  /** Store category, a `$i18n.key`. */
  category: string;
}

const CATEGORY = {
  ai: "$modules.store.category.ai",
  business: "$modules.store.category.business",
  content: "$modules.store.category.content",
  data: "$modules.store.category.data",
  developer: "$modules.store.category.developer",
  growth: "$modules.store.category.growth",
  operations: "$modules.store.category.operations",
} as const;

function storeEntry(
  id: string,
  packageName: string,
  icon: string,
  category: string,
): ModuleStoreEntry {
  return {
    id,
    packageName,
    title: `$modules.store.catalog.${id}.title`,
    description: `$modules.store.catalog.${id}.description`,
    icon,
    category,
  };
}

/**
 * The official AntelopeJS DMS modules (one repository each under the
 * AntelopeJS organisation). Ids and icons are the ones each module registers;
 * Media and Builder register no catalog module, so theirs come from their
 * settings page and the v2 design.
 */
export const MODULE_STORE_CATALOG: readonly ModuleStoreEntry[] = [
  storeEntry("ai", "@antelopejs/dms-ai", "i-ph-robot", CATEGORY.ai),
  storeEntry(
    "api",
    "@antelopejs/dms-api",
    "i-ph-brackets-curly",
    CATEGORY.developer,
  ),
  storeEntry(
    "automation",
    "@antelopejs/dms-automation",
    "i-ph-flow-arrow",
    CATEGORY.operations,
  ),
  storeEntry(
    "builder",
    "@antelopejs/dms-builder",
    "i-ph-hammer",
    CATEGORY.developer,
  ),
  storeEntry(
    "cicd",
    "@antelopejs-private/dms-cicd",
    "i-ph-rocket-launch",
    CATEGORY.operations,
  ),
  storeEntry(
    "database",
    "@antelopejs/dms-database",
    "i-ph-database",
    CATEGORY.data,
  ),
  storeEntry(
    "lang",
    "@antelopejs/dms-lang",
    "i-ph-translate",
    CATEGORY.content,
  ),
  storeEntry(
    "mailing",
    "@antelopejs/dms-mailing",
    "i-ph-envelope-simple",
    CATEGORY.growth,
  ),
  storeEntry(
    "marketing",
    "@antelopejs/dms-marketing",
    "i-ph-chart-line-up",
    CATEGORY.growth,
  ),
  storeEntry("media", "@antelopejs/dms-media", "i-ph-images", CATEGORY.content),
  storeEntry(
    "saas",
    "@antelopejs/dms-saas",
    "i-ph-buildings",
    CATEGORY.business,
  ),
];

/** The AntelopeJS CLI command that adds a package module to a project. */
export const MODULE_INSTALL_COMMAND = "ajs project modules add";

/** The full CLI command that adds the module to a project. */
export function moduleInstallCommand(entry: ModuleStoreEntry): string {
  return `${MODULE_INSTALL_COMMAND} ${entry.packageName}`;
}

/**
 * The store entries not installed on this platform, alphabetical by their
 * shown name.
 */
export function availableStoreModules(
  catalog: readonly ModuleStoreEntry[],
  installedIds: ReadonlySet<string>,
  resolve: DisplayResolver,
): ModuleStoreEntry[] {
  return catalog
    .filter((entry) => !installedIds.has(entry.id))
    .sort((a, b) => resolve(a.title).localeCompare(resolve(b.title)));
}
