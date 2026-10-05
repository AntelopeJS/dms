import type { ModuleCatalogEntry, ModuleStatus, PageInfo } from "../types/page";

/** Category of the modules that declare none. */
export const MODULE_CATEGORY_OTHER = "$modules.category_other";
/** Category filter value that shows every module. */
export const MODULE_CATEGORY_ALL = "";

export type ModuleSortMode = "recent" | "name";

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
 */
export function moduleCategoryOptions(
  entries: readonly FilterableModule[],
  resolve: DisplayResolver,
): ModuleCategoryOption[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const category = moduleCategory(entry);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: resolve(value), count }))
    .sort((a, b) => {
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
  return entries.filter((entry) => {
    if (
      options.category !== MODULE_CATEGORY_ALL &&
      moduleCategory(entry) !== options.category
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
 * `recent`: most recently opened first, never-opened modules after them by
 * name. `name`: alphabetical.
 */
export function sortModules(
  entries: readonly ModuleCatalogEntry[],
  mode: ModuleSortMode,
  visitedAt: ReadonlyMap<string, number>,
  resolve: DisplayResolver,
): ModuleCatalogEntry[] {
  const byName = (a: ModuleCatalogEntry, b: ModuleCatalogEntry) =>
    resolve(a.title).localeCompare(resolve(b.title));
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
 * owning module and the parent category, which the shared type leaves out.
 */
type ServedPage = PageInfo & {
  module?: string;
  category?: { displayName?: string; isModuleRoot?: boolean };
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
  pages: Record<string, PageInfo> | undefined,
  query: string,
  installedModuleIds: ReadonlySet<string>,
  resolve: DisplayResolver,
): ModulePageMatch | null {
  const needle = normalizeQuery(query);
  if (!needle || !pages) return null;
  for (const page of Object.values(pages) as ServedPage[]) {
    if (!page.module || !installedModuleIds.has(page.module)) continue;
    if (!isOpenablePage(page)) continue;
    const pageTitle = resolve(page.displayName);
    if (!pageTitle.toLocaleLowerCase().includes(needle)) continue;
    const parent = page.category;
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
