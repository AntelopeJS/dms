// Pass 1 hides the sidebar's own exclusions (settings + module trees). Pass 2
// re-includes `settings` as a last resort but still hides modules: module pages
// have their own routing/context and are never a redirect target (module roots
// are skipped below, matching the sidebar).
const SIDEBAR_EXCLUDED_TOP_LEVEL_IDS = new Set(["settings", "modules"]);
const LAST_RESORT_EXCLUDED_TOP_LEVEL_IDS = new Set(["modules"]);

interface FirstAccessiblePageOptions {
  excludedTopLevelIds: Set<string>;
}

// A landing target must be a real, directly reachable page: it needs a layout,
// a concrete slug (no `:id` placeholder), and must not be `hidden` — hidden
// pages include the table-view `new`/`edit` sub-pages, which are not valid
// destinations to drop a user on.
function isNavigablePage(node: SiteLayoutTree): boolean {
  return (
    !!node.layoutUrl &&
    !!node.fullSlug &&
    !node.fullSlug.includes(":") &&
    node.hidden !== true
  );
}

// A category whose own `hasAccess` is false can still hold accessible pages,
// so only leaf pages are filtered on `hasAccess`; containers are always
// traversed. Module roots are skipped entirely (never descended into).
function findFirstAccessiblePage(
  node: SiteLayoutTree,
  options: FirstAccessiblePageOptions,
  isTopLevel: boolean,
): string | undefined {
  for (const childId of node.childrenOrders) {
    const child = node.children[childId];
    if (!child || child.isModuleRoot) {
      continue;
    }
    if (isTopLevel && options.excludedTopLevelIds.has(child.id)) {
      continue;
    }
    if (isNavigablePage(child) && child.hasAccess !== false) {
      return child.fullSlug;
    }
    const nested = findFirstAccessiblePage(child, options, false);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

/**
 * Pure resolver: the path of the first page a user can access in the given site
 * layout tree, in tree (sidebar) order. A category the user cannot access is
 * still descended into, because it can hold accessible pages — the goal is to
 * drop the user on a usable page rather than a 403, even when the sidebar hides
 * that page's category. Only navigable, non-hidden leaf pages the user can
 * access are returned. `settings` pages are a last resort; module pages are
 * never a target. Returns `undefined` when the tree is missing or nothing is
 * accessible. Takes the tree as an argument so it can run after an `await`
 * (where composable context is no longer available).
 */
export function firstAccessiblePagePath(
  tree: SiteLayoutTree | undefined,
): string | undefined {
  if (!tree) {
    return undefined;
  }
  return (
    findFirstAccessiblePage(
      tree,
      { excludedTopLevelIds: SIDEBAR_EXCLUDED_TOP_LEVEL_IDS },
      true,
    ) ??
    findFirstAccessiblePage(
      tree,
      { excludedTopLevelIds: LAST_RESORT_EXCLUDED_TOP_LEVEL_IDS },
      true,
    )
  );
}

/**
 * Composable wrapper around {@link firstAccessiblePagePath} that reads the
 * current site layout. Call it synchronously (outside an `await`); to resolve
 * after an `await`, capture the tree first and call `firstAccessiblePagePath`.
 */
export function useFirstAccessiblePagePath(): string | undefined {
  const { siteLayoutTree } = useSiteLayout();
  return firstAccessiblePagePath(siteLayoutTree.value);
}
