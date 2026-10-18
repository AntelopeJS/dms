import type {
  ModuleCatalogEntry,
  ModuleStatus,
  ModuleWithAccess,
  PageInfo,
  SiteLayout,
  SiteLayoutTree,
} from "../../types/page";
import { resolveModuleLandingSlug } from "../../utils/moduleLanding";

/** The Modules page, which lists and manages the installed modules. */
export const MODULES_PAGE_PATH = "/modules";
/** The module store, its own view under the Modules page. */
export const MODULE_STORE_PATH = `${MODULES_PAGE_PATH}/store`;

/**
 * The grid of both module views, installed and store: three columns on a
 * laptop, so a tile's description, readout and footer line have room. The
 * min() keeps one column from overflowing a phone.
 */
export const MODULE_TILE_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-4";

/** Where an installed module's tile is, the one that manages it. */
export function installedModuleLink(moduleId: string): string {
  return `${MODULES_PAGE_PATH}#module-${moduleId}`;
}

/** Category of the modules that declare none. */
export const MODULE_CATEGORY_OTHER = "$modules.category_other";
/** Category filter value that shows every module. */
export const MODULE_CATEGORY_ALL = "";

export type ModuleSortMode = "recent" | "name";

/** The order the installed modules open in until the user picks another. */
export const DEFAULT_MODULE_SORT_MODE: ModuleSortMode = "name";

const MODULE_SORT_MODES: readonly ModuleSortMode[] = ["name", "recent"];

/** A remembered sort mode, or the default when it is missing or unknown. */
export function parseModuleSortMode(value: unknown): ModuleSortMode {
  return (
    MODULE_SORT_MODES.find((mode) => mode === value) ?? DEFAULT_MODULE_SORT_MODE
  );
}

/** Turns a display string (possibly a `$i18n.key`) into the shown text. */
export type DisplayResolver = (value: string) => string;

export interface ModulesSummary {
  installed: number;
  updates: number;
  attention: number;
  beta: number;
}

export interface ModuleCategoryOption {
  value: string;
  label: string;
  count: number;
}

/**
 * What search and category filtering read from a module: an installed
 * catalog entry and a module store entry both carry it.
 */
export type FilterableModule = Pick<
  ModuleCatalogEntry,
  "id" | "title" | "description" | "catalogCategory"
>;

/** A page inside a module whose name matches a search the catalog missed. */
export interface ModulePageMatch {
  moduleId: string;
  path: string;
  pageTitle: string;
  /** Heading the page sits under in the module, when it has one. */
  sectionTitle?: string;
}

export function moduleStatus(entry: ModuleCatalogEntry): ModuleStatus {
  return entry.status ?? "live";
}

export function moduleCategory(
  entry: Pick<ModuleCatalogEntry, "catalogCategory">,
): string {
  const category = entry.catalogCategory?.trim();
  return category ? category : MODULE_CATEGORY_OTHER;
}

export function summarizeModules(
  entries: readonly ModuleCatalogEntry[],
): ModulesSummary {
  const summary: ModulesSummary = {
    installed: entries.length,
    updates: 0,
    attention: 0,
    beta: 0,
  };
  for (const entry of entries) {
    const status = moduleStatus(entry);
    if (status === "update") summary.updates += 1;
    else if (status === "attention") summary.attention += 1;
    else if (status === "beta") summary.beta += 1;
  }
  return summary;
}

/**
 * Category filter options: the categories present, alphabetical, with
 * "Other" last. The "All" option is the caller's to add.
 *
 * Categories are told apart by their shown name: two modules that each name
 * "Content" through their own i18n key share one option, whose value is the
 * first key met.
 */
export function moduleCategoryOptions(
  entries: readonly FilterableModule[],
  resolve: DisplayResolver,
): ModuleCategoryOption[] {
  const byLabel = new Map<string, ModuleCategoryOption>();
  for (const entry of entries) {
    const value = moduleCategory(entry);
    const label = resolve(value);
    const option = byLabel.get(label);
    if (option) option.count += 1;
    else byLabel.set(label, { value, label, count: 1 });
  }
  return [...byLabel.values()].sort((a, b) => {
    if (a.value === MODULE_CATEGORY_OTHER) return 1;
    if (b.value === MODULE_CATEGORY_OTHER) return -1;
    return a.label.localeCompare(b.label);
  });
}

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function filterModules<T extends FilterableModule>(
  entries: readonly T[],
  options: { query: string; category: string; resolve: DisplayResolver },
): T[] {
  const query = normalizeQuery(options.query);
  const category =
    options.category === MODULE_CATEGORY_ALL
      ? undefined
      : options.resolve(options.category);
  return entries.filter((entry) => {
    if (
      category !== undefined &&
      options.resolve(moduleCategory(entry)) !== category
    ) {
      return false;
    }
    if (!query) return true;
    const haystack = [
      entry.id,
      options.resolve(entry.title),
      options.resolve(entry.description),
      options.resolve(moduleCategory(entry)),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(query);
  });
}

/**
 * Compares shown names as `locale` orders them: accents and case only break
 * ties ("Mailing", "Marketing", "Médiathèque"), and digits read as numbers.
 * An unknown locale falls back to the runtime's own.
 */
export function compareDisplayNames(
  locale?: string,
): (a: string, b: string) => number {
  const options: Intl.CollatorOptions = { numeric: true };
  try {
    return new Intl.Collator(locale, options).compare;
  } catch {
    return new Intl.Collator(undefined, options).compare;
  }
}

/**
 * `recent`: most recently opened first, never-opened modules after them by
 * name. `name`: alphabetical by shown name, in `locale`'s order.
 */
export function sortModules(
  entries: readonly ModuleCatalogEntry[],
  mode: ModuleSortMode,
  visitedAt: ReadonlyMap<string, number>,
  resolve: DisplayResolver,
  locale?: string,
): ModuleCatalogEntry[] {
  const compare = compareDisplayNames(locale);
  const byName = (a: ModuleCatalogEntry, b: ModuleCatalogEntry) =>
    compare(resolve(a.title), resolve(b.title));
  return [...entries].sort((a, b) => {
    if (mode === "recent") {
      const delta = (visitedAt.get(b.id) ?? -1) - (visitedAt.get(a.id) ?? -1);
      if (delta !== 0) return delta;
    }
    return byName(a, b);
  });
}

/**
 * A page as `/dms/sitelayout` serves it: the payload also carries the
 * owning module, which the shared type leaves out.
 */
type ServedPage = PageInfo & {
  module?: string;
};

function isOpenablePage(page: ServedPage): boolean {
  if (page.hidden || page.hasAccess === false) return false;
  if (page.type === "label") return false;
  // A page that needs a URL parameter or a query cannot be opened from a
  // bare link.
  if (page.fullSlug.includes(":")) return false;
  return !page.validation?.requiredQueryParams?.length;
}

/**
 * When no module matches a search, finds the module page whose name does, so
 * the empty state can point to where the thing actually lives.
 */
export function findModulePageMatch(
  siteLayout: Pick<SiteLayout, "pages" | "categories"> | undefined,
  query: string,
  installedModuleIds: ReadonlySet<string>,
  resolve: DisplayResolver,
): ModulePageMatch | null {
  const needle = normalizeQuery(query);
  if (!needle || !siteLayout) return null;
  for (const page of Object.values(siteLayout.pages) as ServedPage[]) {
    if (!page.module || !installedModuleIds.has(page.module)) continue;
    if (!isOpenablePage(page)) continue;
    const pageTitle = resolve(page.displayName);
    if (!pageTitle.toLocaleLowerCase().includes(needle)) continue;
    const parent = page.categoryId
      ? siteLayout.categories[page.categoryId]
      : undefined;
    const sectionTitle =
      parent?.displayName && !parent.isModuleRoot
        ? resolve(parent.displayName)
        : undefined;
    return {
      moduleId: page.module,
      path: page.fullSlug,
      pageTitle,
      sectionTitle,
    };
  }
  return null;
}

/** A visited module as the command palette's recent modules list it. */
export interface RecentModule {
  moduleId: string;
  /** Display name, possibly a `$i18n.key`. */
  title: string;
  icon: string;
  /** The module's landing page, never the page it was left on. */
  to: string;
}

/** A visit of the module history, oldest first as it keeps them. */
export interface ModuleVisit {
  moduleId: string;
}

/**
 * The visited modules the caller may still open, most recent first, each
 * leading to its landing page: every way into a module lands there. A module
 * with no page the caller may open is left out.
 */
export function recentModules(
  visits: readonly ModuleVisit[],
  modules: Readonly<Record<string, ModuleWithAccess>> | undefined,
  tree: SiteLayoutTree | undefined,
): RecentModule[] {
  return visits
    .slice()
    .reverse()
    .flatMap((visit) => {
      const module = modules?.[visit.moduleId];
      if (!module?.hasAccess) return [];
      const to = resolveModuleLandingSlug(
        tree,
        visit.moduleId,
        module.landingPage,
      );
      if (!to) return [];
      return [
        {
          moduleId: visit.moduleId,
          title: module.title,
          icon: module.icon,
          to,
        },
      ];
    });
}
